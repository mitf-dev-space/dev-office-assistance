import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Local dev: proxy to the API on the host. In docker-compose.dev.yml, set DOCKER_API_URL=http://api:4000.
function envString(key: string): string | undefined {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env?.[key];
}
const devApiProxy = envString("DOCKER_API_URL") ?? "http://127.0.0.1:4000";
const dockerDev = Boolean(envString("DOCKER_API_URL"));

/** GitHub Pages / subpath: set `VITE_BASE` (e.g. `/repo-name/`). */
function normalizeViteBase(raw: string | undefined): string {
  if (!raw || raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
}
const base = normalizeViteBase(envString("VITE_BASE"));

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-icon.svg", "favicon.svg"],
      strategies: "generateSW",
      manifest: {
        name: "Helm",
        short_name: "Helm",
        description: "Triage, planning, mobile builds, and your team in one place.",
        theme_color: "#0f766e",
        background_color: "#f5f4f2",
        display: "standalone",
        start_url: base,
        scope: base,
        orientation: "portrait-primary",
        icons: [
          {
            src: "pwa-icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "pwa-icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,svg,woff,woff2}"],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: Number(envString("WEB_DEV_PORT") ?? "5174"),
    strictPort: false,
    host: true,
    watch: {
      // File watching in Docker Desktop (Windows/macOS) often needs polling.
      usePolling: dockerDev,
    },
    proxy: {
      "/api": {
        target: devApiProxy,
        changeOrigin: true,
      },
      "/healthz": {
        target: devApiProxy,
        changeOrigin: true,
      },
    },
  },
});
