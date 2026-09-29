# Data Model: Access Control

## Credentials (Kubernetes Secret)

| Key | Meaning |
| --- | --- |
| `username` | Sign-in name; `auth.username`, default `admin` |
| `password` | `auth.password`, or 24 random alphanumerics kept across upgrades |

Mounted read-only into the backend at `/etc/galaxy/auth/`. Replaced by `auth.existingSecret` when
set (same keys).

## Session (cookie `galaxy_session`)

| Part | Meaning |
| --- | --- |
| expiry | Unix seconds, issue time + 24 h |
| signature | HMAC-SHA256 of the expiry under a key derived from the password |

Valid when the signature matches and the expiry is in the future. No server-side state.

## Failed-attempt window (in memory, per client IP)

| Field | Meaning |
| --- | --- |
| failures | Count within the current 10-minute window |
| windowStart | When the window began |

More than 10 failures in a window → 429 until it ends. Pruned on each attempt.

## Chart values (new or changed)

| Value | Default | Meaning |
| --- | --- | --- |
| `auth.enabled` | `true` | Require sign-in for `/api/*` |
| `auth.username` | `admin` | Sign-in name |
| `auth.password` | `""` | Empty → generated |
| `auth.existingSecret` | `""` | Use this Secret instead |
| `backend.resources`, `frontend.resources` | see research R7 | Requests and limits |
| `ingress.tls.clusterIssuer` | `""` | cert-manager ClusterIssuer for `ingress.host` |

`ingress.tls` becomes an object: `clusterIssuer` plus `extra` (the previous free-form list).
