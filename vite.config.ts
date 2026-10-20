import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 4179,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4179,
    strictPort: true,
  },
});
