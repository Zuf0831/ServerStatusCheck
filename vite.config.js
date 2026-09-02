import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Build straight into a folder you can upload to public_html.
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    // `npm run dev:api` serves PHP on :8000; proxying keeps it same-origin
    // so the session cookie behaves exactly like it will in production.
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: false },
    },
  },
});
