import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/report-error": "http://127.0.0.1:8000",
      "/open-data-folder": "http://127.0.0.1:8000",
    },
  },
});
