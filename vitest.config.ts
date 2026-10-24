import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    // Unit tests that drive real git and runners in temporary repositories take seconds, not milliseconds.
    testTimeout: 60_000,
    // Temporary repositories must not pick up the person's hooks, signing or identity.
    env: { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
  },
});
