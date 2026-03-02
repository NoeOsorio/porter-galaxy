# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/server ./cmd/server

# ── Stage 2: Run ───────────────────────────────────────────────────────────────
FROM scratch

COPY --from=builder /bin/server /server

EXPOSE 4000

ENTRYPOINT ["/server"]
