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

# Numeric so the pod's runAsNonRoot check can verify it without a passwd file.
USER 65532:65532

EXPOSE 4000

ENTRYPOINT ["/server"]
