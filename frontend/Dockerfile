# ── Stage 1: Build WASM ────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS wasm-builder

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY src/ ./src/

RUN GOOS=js GOARCH=wasm go build -ldflags="-s -w" -o /dist/main.wasm ./src && \
    cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" /dist/wasm_exec.js

# ── Stage 2: Build CSS ─────────────────────────────────────────────────────────
FROM node:20-alpine AS css-builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tailwind.config.js postcss.config.js ./
COPY src/styles/ ./src/styles/
COPY public/index.html ./public/

RUN mkdir -p public/dist && \
    npx tailwindcss -i src/styles/main.css -o public/dist/styles.css --minify

# ── Stage 3: Assemble static assets ───────────────────────────────────────────
FROM scratch AS static

COPY --from=wasm-builder /dist/main.wasm     /public/main.wasm
COPY --from=wasm-builder /dist/wasm_exec.js  /public/wasm_exec.js
COPY --from=css-builder  /app/public/        /public/
