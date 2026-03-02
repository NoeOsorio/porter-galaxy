# ── Stage 1: Copy frontend static assets from the frontend image ───────────────
FROM porter-galaxy-frontend AS frontend-assets

# ── Stage 2: nginx serving layer ───────────────────────────────────────────────
FROM nginx:1.27-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Porter Galaxy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Pull compiled static assets from the frontend build stage
COPY --from=frontend-assets /public /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
