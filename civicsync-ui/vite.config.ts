import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8005",
        changeOrigin: true,
        // Large PDFs + parsing on the server can take a while
        timeout: 300_000,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
