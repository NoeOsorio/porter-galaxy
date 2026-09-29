#!/usr/bin/env bash
# Shared verification lane: any number of worktrees can develop in parallel,
# but only one verifies at a time. The lock serializes runs across worktrees
# because they share the fake-stream, preview, and Chrome debug ports, and
# concurrent headless Chrome runs would skew each other's frame rates.
#
# Usage: hack/verify.sh [scenario ...]
#   scenarios: functional labels layout perf webgl stream (default: all)
# Env: THROTTLE (perf CPU slowdown, default 4), VERIFY_OUT (screenshots dir).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="${TMPDIR:-/tmp}/porter-galaxy-verify.lock"
OUT="${VERIFY_OUT:-$ROOT/verify-out}"
WORK="$(mktemp -d)"
FAKE_PORT=4078
PREVIEW_PORT=5199
SCENARIOS=("$@")
[ ${#SCENARIOS[@]} -eq 0 ] && SCENARIOS=(functional labels layout perf webgl stream)

until mkdir "$LOCK" 2>/dev/null; do
  echo "verify: waiting for $(cat "$LOCK/owner" 2>/dev/null || echo 'another run') ..."
  sleep 10
done
echo "$ROOT (pid $$)" > "$LOCK/owner"

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; done
  for port in $FAKE_PORT $PREVIEW_PORT; do lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true; done
  rm -rf "$LOCK" "$WORK"
}
trap cleanup EXIT

for port in $FAKE_PORT $PREVIEW_PORT; do
  if lsof -tiTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
    echo "verify: port $port is busy; stop whatever is using it" >&2
    exit 1
  fi
done

echo "== gates"
(cd "$ROOT/backend" && go build ./... && go vet ./...)
(cd "$ROOT/frontend" && npm run lint --silent)
helm lint "$ROOT/charts/porter-galaxy" >/dev/null

echo "== build"
(cd "$ROOT/backend" && go build -o "$WORK/fakestream" ./cmd/fakestream)
(cd "$ROOT/frontend" && VITE_API_URL="http://localhost:$FAKE_PORT" npm run build --silent -- --outDir "$WORK/dist" --emptyOutDir --logLevel error >/dev/null)

start_fake() {
  if [ -n "${FAKE_PID:-}" ]; then
    kill "$FAKE_PID" 2>/dev/null || true
    # The previous stream must be gone, or readyz below would answer from it.
    while lsof -tiTCP:$FAKE_PORT -sTCP:LISTEN >/dev/null 2>&1; do sleep 0.1; done
  fi
  "$WORK/fakestream" -port $FAKE_PORT "$@" >"$WORK/fakestream.log" 2>&1 &
  FAKE_PID=$!
  disown "$FAKE_PID"
  PIDS+=("$FAKE_PID")
  until curl -sf "localhost:$FAKE_PORT/readyz" >/dev/null; do sleep 0.2; done
}

(cd "$ROOT/frontend" && exec ./node_modules/.bin/vite preview --outDir "$WORK/dist" --port $PREVIEW_PORT --strictPort >"$WORK/preview.log" 2>&1) &
PIDS+=("$!")
disown "$!"
until curl -sf "localhost:$PREVIEW_PORT/" >/dev/null; do sleep 0.2; done

mkdir -p "$OUT"
URL="http://localhost:$PREVIEW_PORT/"
status=0
for scenario in "${SCENARIOS[@]}"; do
  echo "== $scenario"
  case "$scenario" in
    functional|labels|webgl) start_fake -pods 1000 -churn 0; target="$URL" ;;
    layout) start_fake -pods 1000 -churn 500ms -churn-size 1; target="$URL?stats" ;;
    perf) start_fake -pods 3000 -churn 500ms; target="$URL?stats" ;;
    stream)
      # check.mjs restarts the fake stream mid-run to test the client's resync.
      start_fake -pods 1000 -churn 500ms; target="$URL"
      export FAKE_BIN="$WORK/fakestream" FAKE_PID FAKE_ARGS="-port $FAKE_PORT -pods 1000 -churn 500ms" ;;
    *) echo "unknown scenario: $scenario" >&2; status=1; continue ;;
  esac
  THROTTLE="${THROTTLE:-4}" node "$ROOT/hack/verify/check.mjs" "$scenario" "$target" "$OUT" || status=1
done

echo "== screenshots in $OUT"
exit $status
