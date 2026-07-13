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
    watch: {
      // Ignora a pasta onde o Rust compila, senão o Vite tenta "vigiar"
      // arquivos .exe temporários enquanto o Cargo ainda está escrevendo
      // neles, e o Windows trava com erro EBUSY.
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});