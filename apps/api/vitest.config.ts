import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Route tests share one local test database, so test files run one at a
    // time instead of in parallel workers.
    fileParallelism: false,
    globalSetup: "./test/helpers/globalSetup.ts",
    setupFiles: ["./test/helpers/setup.ts"],
    include: ["test/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
