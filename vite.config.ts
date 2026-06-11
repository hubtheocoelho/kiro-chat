import { defineConfig } from "vite";

// Fixed port matching devUrl in tauri.conf.json; src-tauri is ignored so Rust
// builds don't restart the dev server.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "chrome105",
    minify: "esbuild",
    sourcemap: false,
  },
});
