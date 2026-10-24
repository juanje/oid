import { describe, expect, test } from "vitest";
import { turnLimitReached } from "../../src/limits.ts";

describe("turnLimitReached", () => {
  test("an attempt the executor ended at the limit reached it", () => {
    expect(turnLimitReached({ turns: 3, stoppedAtLimit: true }, 3)).toBe(true);
  });

  test("an attempt that finished within its turns did not", () => {
    expect(turnLimitReached({ turns: 3, stoppedAtLimit: false }, 3)).toBe(false);
  });

  test("an executor that reports more turns than the limit did not respect it: the limit counts as reached", () => {
    expect(turnLimitReached({ turns: 5, stoppedAtLimit: false }, 3)).toBe(true);
  });
});
