import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    pool: "forks",
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: ["test/**/*.test.ts"],
  },
})
