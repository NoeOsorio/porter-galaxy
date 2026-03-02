#!/usr/bin/env bash
# Porter Galaxy — one-shot build script
# Compiles the WASM binary, processes CSS, and places all assets in frontend/public/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$ROOT_DIR/frontend"
PUBLIC_DIR="$FRONTEND_DIR/public"

echo "==> Building Porter Galaxy"

# ── WASM ───────────────────────────────────────────────────────────────────────
echo "--> Compiling Go frontend to WebAssembly..."
cd "$FRONTEND_DIR"
GOOS=js GOARCH=wasm go build -ldflags="-s -w" -o "$PUBLIC_DIR/main.wasm" ./src
echo "--> Copying wasm_exec.js runtime..."
cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" "$PUBLIC_DIR/wasm_exec.js"

# ── CSS ────────────────────────────────────────────────────────────────────────
echo "--> Building Tailwind CSS..."
mkdir -p "$PUBLIC_DIR/dist"
npx tailwindcss -i src/styles/main.css -o "$PUBLIC_DIR/dist/styles.css" --minify

echo "==> Build complete. Assets in $PUBLIC_DIR"
