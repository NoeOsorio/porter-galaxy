import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const api: ProxyOptions = {
  target: process.env.GALAXY_API ?? "http://localhost:4000",
  // http-proxy keeps the browser's response open when the backend drops a
  // stream, so EventSource would never reconnect; nginx closes it in production.
  configure: (proxy) => proxy.on("proxyRes", (upstream, _req, res) => upstream.on("close", () => res.writableEnded || res.destroy())),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Same-origin API in dev and preview, as in production: the session cookie is SameSite=Strict.
  server: { proxy: { "/api": api } },
  preview: { proxy: { "/api": api } },
})
