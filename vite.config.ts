import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuração recomendada pelo próprio Tauri para funcionar bem
// junto com o processo Rust (porta fixa, não limpar o terminal, etc).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});
