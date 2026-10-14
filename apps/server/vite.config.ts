import { defineConfig } from "vite";

export default defineConfig({
  worker: {
    execArgv: ["--experimental-sqlite"],
  },
  optimizeDeps: {
    exclude: ["node:sqlite"],
  },
});