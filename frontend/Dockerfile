# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Serve ─────────────────────────────────────────────────────────────
# Runs as UID 101 and keeps its pid and temp files in /tmp, so the pod can use
# a read-only root filesystem with emptyDirs on /tmp and conf.d.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
# Outside conf.d: the chart mounts an emptyDir there for the rendered config.
COPY nginx.conf.template /etc/nginx/galaxy.conf.template

EXPOSE 8080

# Substitute only $BACKEND_URL, leaving nginx $variables untouched
CMD ["/bin/sh", "-c", \
  "envsubst '$BACKEND_URL' < /etc/nginx/galaxy.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
