import { resolve } from "node:path";
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// Vite 8 (bundler Rolldown, compiler Oxc). El cliente vive en client/ (app React
// + TypeScript); el servidor Node + ws (server/server.js) sigue siendo independiente
// y sirve el build de dist/ en prod.
//
// Dev:  pnpm run dev:client (Vite + HMR, :5173) · pnpm run dev:server (node, :8080/:8081)
//       en dos terminales. El proxy de abajo redirige /ws y /config al servidor.
// Prod: pnpm run build → dist/ · pnpm start → server.js sirve dist/.
export default defineConfig({
  root: "client",
  // El juego es autocontenido (audio procedural, canvas, sin assets externos).
  publicDir: false,
  plugins: [
    // React + Fast Refresh (Oxc). React Compiler vía @rolldown/plugin-babel + preset.
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    // Tailwind CSS v4 (plugin oficial de Vite).
    tailwindcss(),
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rolldownOptions: {
      // Multi-page: el juego y el panel admin. Nombre canónico en Vite 8
      // (rollupOptions sigue como alias deprecado).
      input: {
        index: resolve(import.meta.dirname, "client/index.html"),
        admin: resolve(import.meta.dirname, "client/admin.html"),
      },
    },
  },
  server: {
    proxy: {
      // WebSocket del juego → servidor autoritativo (:8080), path "/ws".
      "/ws": { target: "ws://localhost:8080", ws: true },
      // API del panel admin (GET/POST /config) → servidor admin (:8081).
      "/config": { target: "http://localhost:8081", changeOrigin: true },
    },
  },
});
