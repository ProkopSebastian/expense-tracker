import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/zrender/")) return "chart-renderer";
          if (id.includes("/echarts/")) return "charts";
          if (id.includes("/node_modules/")) return "vendor";
        },
      },
    },
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
