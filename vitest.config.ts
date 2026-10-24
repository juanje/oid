import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    // Unit tests that drive real git and runners in temporary repositories take seconds, not milliseconds.
    testTimeout: 60_000,
  },
});
