import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative paths so the build works from any folder or static host (GitHub Pages included).
  base: "./",
  resolve: {
    // The UI only needs the bundle types and lineToFrame, which have no runtime dependencies.
    alias: { "@poltergeist/core": fileURLToPath(new URL("../core/src/bundle.ts", import.meta.url)) },
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  server: { proxy: { "/bundles": "http://127.0.0.1:8737", "/events": "http://127.0.0.1:8737" } },
});
