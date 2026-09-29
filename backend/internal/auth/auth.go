// Package auth is Galaxy's built-in sign-in: one shared account whose
// password comes from a mounted Secret, and a stateless signed session cookie
// (specs/005-access-control/contracts/auth.md).
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	cookieName    = "galaxy_session"
	sessionTTL    = 24 * time.Hour
	failureDelay  = time.Second
	maxFailures   = 10
	failureWindow = 10 * time.Minute
)

type credentials struct {
	username string
	password string
	key      []byte // session signing key, derived from password
}

// Auth checks credentials and sessions. Credentials come either from files in
// a directory (re-read when they change, so a rotated Secret applies without a
// restart) or from fixed values.
type Auth struct {
	dir string

	mu      sync.Mutex
	creds   credentials
	modTime time.Time
	fails   map[string]*failures
}

type failures struct {
	count int
	since time.Time
}

// FromDir reads `username` and `password` files from dir.
func FromDir(dir string) (*Auth, error) {
	a := &Auth{dir: dir, fails: map[string]*failures{}}
	if _, err := a.current(); err != nil {
		return nil, err
	}
	return a, nil
}

// Fixed uses the given credentials for the life of the process.
func Fixed(username, password string) *Auth {
	return &Auth{creds: newCredentials(username, password), fails: map[string]*failures{}}
}

func newCredentials(username, password string) credentials {
	m := hmac.New(sha256.New, []byte(password))
	m.Write([]byte("galaxy-session-v1"))
	return credentials{username: username, password: password, key: m.Sum(nil)}
}

func (a *Auth) current() (credentials, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.dir == "" {
		return a.creds, nil
	}
	pw := filepath.Join(a.dir, "password")
	info, err := os.Stat(pw)
	if err != nil {
		return credentials{}, fmt.Errorf("auth: %w", err)
	}
	if !info.ModTime().Equal(a.modTime) || a.creds.password == "" {
		password, err := os.ReadFile(pw)
		if err != nil {
			return credentials{}, fmt.Errorf("auth: %w", err)
		}
		username, err := os.ReadFile(filepath.Join(a.dir, "username"))
		if err != nil {
			return credentials{}, fmt.Errorf("auth: %w", err)
		}
		p := strings.TrimSpace(string(password))
		if p == "" {
			return credentials{}, errors.New("auth: password is empty")
		}
		a.creds = newCredentials(strings.TrimSpace(string(username)), p)
		a.modTime = info.ModTime()
	}
	return a.creds, nil
}

func (a *Auth) sign(c credentials, expiry int64) string {
	m := hmac.New(sha256.New, c.key)
	m.Write([]byte(strconv.FormatInt(expiry, 10)))
	return strconv.FormatInt(expiry, 10) + "." + hex.EncodeToString(m.Sum(nil))
}

// valid reports whether r carries an unexpired session signed with the
// current password.
func (a *Auth) valid(r *http.Request) bool {
	cookie, err := r.Cookie(cookieName)
	if err != nil {
		return false
	}
	c, err := a.current()
	if err != nil {
		return false
	}
	expiryText, _, ok := strings.Cut(cookie.Value, ".")
	if !ok {
		return false
	}
	expiry, err := strconv.ParseInt(expiryText, 10, 64)
	if err != nil || time.Now().Unix() >= expiry {
		return false
	}
	return hmac.Equal([]byte(cookie.Value), []byte(a.sign(c, expiry)))
}

// Middleware rejects requests without a valid session.
func (a *Auth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !a.valid(r) {
			writeError(w, http.StatusUnauthorized, "sign in required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *Auth) HandleLogin(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if wait := a.blockedFor(ip); wait > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
		writeError(w, http.StatusTooManyRequests, "too many attempts")
		return
	}
	var body struct{ Username, Password string }
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	c, err := a.current()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "sign-in unavailable")
		return
	}
	userOK := subtle.ConstantTimeCompare([]byte(body.Username), []byte(c.username)) == 1
	passOK := subtle.ConstantTimeCompare([]byte(body.Password), []byte(c.password)) == 1
	if !userOK || !passOK {
		a.fail(ip)
		time.Sleep(failureDelay)
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	expiry := time.Now().Add(sessionTTL).Unix()
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    a.sign(c, expiry),
		Path:     "/",
		MaxAge:   int(sessionTTL.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
	})
	w.WriteHeader(http.StatusNoContent)
}

func (a *Auth) HandleLogout(w http.ResponseWriter, _ *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
	w.WriteHeader(http.StatusNoContent)
}

func (a *Auth) HandleSession(w http.ResponseWriter, r *http.Request) {
	if !a.valid(r) {
		writeError(w, http.StatusUnauthorized, "sign in required")
		return
	}
	c, _ := a.current()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"username": c.username})
}

func (a *Auth) blockedFor(ip string) time.Duration {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	for k, f := range a.fails {
		if now.Sub(f.since) > failureWindow {
			delete(a.fails, k)
		}
	}
	if f := a.fails[ip]; f != nil && f.count >= maxFailures {
		return failureWindow - now.Sub(f.since)
	}
	return 0
}

func (a *Auth) fail(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	f := a.fails[ip]
	if f == nil {
		f = &failures{since: time.Now()}
		a.fails[ip] = f
	}
	f.count++
}

// clientIP uses the first X-Forwarded-For entry set by the ingress and the
// frontend's nginx, falling back to the connection's address.
func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		first, _, _ := strings.Cut(fwd, ",")
		return strings.TrimSpace(first)
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
