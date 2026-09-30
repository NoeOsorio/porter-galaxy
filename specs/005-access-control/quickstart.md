# Quickstart: verify each slice

## Every slice

```bash
make verify          # gates + fake-stream checks, including the auth scenario
```

Then deploy: `make release VERSION=<x.y.z>`, set the Porter add-on's **Chart Version**, and open the
app. `pk` = `porter kubectl --project <project-id> --cluster <cluster-id> --`.

## §1 Sign in with a password (US1, 0.13.0)

1. After the upgrade, open the app in a private window: the login form shows and no graph loads.
2. `curl -s -o /dev/null -w '%{http_code}' <url>/api/v1/clusters` returns `401` (SC-001).
3. Read the generated password:
   `pk get secret -n <release-namespace> <release>-porter-galaxy-auth -o jsonpath='{.data.password}' | base64 -d`.
4. A wrong password shows an error after about a second; the right one loads both views, live.
5. Upgrade the add-on again with no value changes: the same password still works.
6. "Sign out" returns to the login form, and the stream stops.

## §2 Safe by default (US2, 0.15.0)

1. `helm template galaxy charts/porter-galaxy` with default values has no Ingress, a `ClusterIP`
   Service, both containers with `runAsNonRoot`, `readOnlyRootFilesystem`, dropped capabilities,
   and requests and limits.
2. Label a scratch namespace `pod-security.kubernetes.io/enforce=restricted` and install there: both
   pods start (SC-002).
3. From the browser console on another origin, `fetch('<url>/api/auth/session')` is blocked by CORS.

## §3 HTTPS with my own domain (US3, 0.16.0)

1. Create a DNS record from `<host>` to the ingress load balancer.
2. Set `ingress.host: <host>` and `ingress.tls.clusterIssuer: <issuer>`; the certificate becomes
   Ready within a few minutes.
3. `https://<host>` loads with a valid certificate, and after signing in the `galaxy_session`
   cookie is marked Secure.
