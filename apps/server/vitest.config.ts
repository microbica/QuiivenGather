import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: [],
      },
    },
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["**/*.manual.test.ts"],
    optimizeDeps: {
      exclude: ["node:sqlite"],
    },
  },
});