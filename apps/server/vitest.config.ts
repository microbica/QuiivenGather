import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/*.manual.test.ts", "dist/**", "node_modules/**"],
  },
});
