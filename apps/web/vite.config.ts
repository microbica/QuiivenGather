import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // PREVIEW_BASE=./ builds a relocatable bundle for static design previews.
  base: process.env.PREVIEW_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
