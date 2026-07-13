import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
        type: "module",
      },
      // Use the existing public/manifest.json — don't generate a new one.
      manifest: false,
      injectManifest: {
        injectionPoint: "self.__WB_MANIFEST",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Never ship sourcemaps to production — they expose the full source tree.
    sourcemap: false,
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    host: true,
  },
  preview: {
    port: Number(process.env.PORT) || 4173,
    host: true,
  },
});
