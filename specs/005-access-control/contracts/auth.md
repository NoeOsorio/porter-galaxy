# Contract: Authentication

All paths are served by the backend and proxied by the frontend's nginx under `/api/`. When
`auth.enabled` is false, the middleware is off and `/api/auth/session` always returns 200.

## `POST /api/auth/login`

Request: `Content-Type: application/json`, body `{"username": "admin", "password": "..."}`.

| Response | When |
| --- | --- |
| `204` + `Set-Cookie: galaxy_session=...; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400[; Secure]` | Credentials match |
| `401` `{"error": "invalid credentials"}` after a 1 s delay | Wrong username or password |
| `429` `{"error": "too many attempts"}` + `Retry-After` | More than 10 failures from this client in 10 min |

## `POST /api/auth/logout`

`204` and `Set-Cookie: galaxy_session=; Max-Age=0`. Always succeeds.

## `GET /api/auth/session`

`200 {"username": "admin"}` with a valid session; `401` otherwise. The SPA calls it on load and
after the stream errors.

## Every other `/api/*` path

`401` `{"error": "sign in required"}` without a valid session. This includes
`GET /api/v1/clusters` (the SSE stream, [spec 003 contract](../../003-workload-coverage-and-health/contracts/stream.md)).

## Open paths

`/healthz` and `/readyz` never require a session.

## CORS

No `Access-Control-Allow-Origin` header on any response.
