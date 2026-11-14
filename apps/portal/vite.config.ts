import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

const API_TARGET = process.env.VITE_API_TARGET ?? "http://127.0.0.1:3000"
const SRC = fileURLToPath(new URL("./src", import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: [
        "icons/favicon.svg",
        "icons/favicon-32.png",
        "icons/casarenous-apple-touch-icon-180.png",
        "brand/casarenous-symbol.svg",
        "offline.html",
      ],
      manifest: {
        name: "CasaRenous — Carnet de chantier",
        short_name: "CasaRenous",
        description:
          "Suivi de chantier, visionneuse 3D, rétroplanning, coffre-fort documentaire et budget de la maison Sévin–Renous.",
        lang: "fr",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait",
        background_color: "#F6F1E9",
        theme_color: "#D46640",
        categories: ["productivity", "utilities", "lifestyle"],
        icons: [
          {
            src: "icons/casarenous-app-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "icons/casarenous-app-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        globIgnores: ["**/models/**"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/models\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        importScripts: ["push-sw.js"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/models/"),
            handler: "CacheFirst",
            options: {
              cacheName: "casarenous-models-v1",
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": SRC,
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: false,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: false,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three") || id.includes("@react-three")) {
            return "three"
          }
          if (id.includes("node_modules/react")) return "react"
          if (id.includes("@tanstack")) return "query"
          return undefined
        },
      },
    },
  },
})
