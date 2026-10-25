import { describe, expect, test } from "vitest";
import { type Failing, innerLoop, type RoundResult, sameFailure } from "../../src/inner-loop.ts";

const REFUSAL = { failed: "f", evidence: "e", next: "n" };
const WHEN: Failing = { step: 'I greet "Ada" and "Grace"', message: "TypeError: greetPair is not a function" };
const THEN: Failing = { step: 'I get "Hello, Ada and Grace!"', message: "AssertionError: undefined !== 'Hello, Ada and Grace!'" };
const LIMITS = { retries: 1, rounds: 6 };

/** A loop whose rounds answer `results` in turn, and whose scenario fails as `failures` say after each round that adds a test. */
async function loop(results: RoundResult[], failures: (Failing | undefined)[], limits = LIMITS) {
  const given: (Failing | undefined)[] = [];
  const stalls: Failing[] = [];
  let checks = 0;
  const end = await innerLoop(
    async (previous) => {
      given.push(previous);
      return results.shift()!;
    },
    async () => {
      checks += 1;
      return failures.shift();
    },
    WHEN,
    limits,
    async (failure) => {
      stalls.push(failure);
    },
  );
  return { end, given, stalls, checks };
}

describe("innerLoop", () => {
  test("repeats rounds until the scenario passes, while each round moves the failure on", async () => {
    const { end, given } = await loop([{ added: true }, { added: true }], [THEN, undefined]);

    expect({ end, given }).toEqual({ end: { built: true }, given: [undefined, undefined] });
  });

  test("ends at the first refused round, without checking the scenario", async () => {
    const { end, checks } = await loop([{ refusal: REFUSAL }], []);

    expect({ end, checks }).toEqual({ end: { refusal: REFUSAL }, checks: 0 });
  });

  test("a round that adds no test makes no progress, without checking the scenario: the next round gets the unchanged failure, and when the retries run out the loop stalls", async () => {
    const { end, given, stalls, checks } = await loop([{ added: false }, { added: false }], []);

    expect({ end, given, stalls, checks }).toEqual({ end: { stalled: WHEN }, given: [undefined, WHEN], stalls: [WHEN, WHEN], checks: 0 });
  });

  test("a round after which the scenario fails the same way makes no progress; one that moves the failure on resets the count", async () => {
    // WHEN → THEN moves on; THEN again is one round with no progress; WHEN moves on and resets the count, so the
    // next WHEN is the first in a row again, and only the one after it uses the retry up.
    const { end, stalls } = await loop(
      [{ added: true }, { added: true }, { added: true }, { added: true }, { added: true }],
      [THEN, THEN, WHEN, WHEN, WHEN],
      { retries: 1, rounds: 10 },
    );

    expect({ end, stalls }).toEqual({ end: { stalled: WHEN }, stalls: [THEN, WHEN, WHEN] });
  });

  test("stops at its limit of rounds with the last failure, even when every round moves the failure on", async () => {
    const alternating = [THEN, WHEN, THEN];

    const { end, checks } = await loop([{ added: true }, { added: true }, { added: true }], alternating, { retries: 1, rounds: 3 });

    expect({ end, checks }).toEqual({ end: { limit: THEN }, checks: 3 });
  });
});

describe("sameFailure", () => {
  test("is the same step and the same message, whatever the stack lines say", () => {
    const at = (line: number): Failing => ({ ...THEN, message: `${THEN.message}\n    at World.<anonymous> (/work/src/greet-all.ts:${line}:9)` });

    expect(sameFailure(at(3), at(7))).toBe(true);
    expect(sameFailure(THEN, { ...THEN, message: "AssertionError: 'Hello' !== 'Hello, Ada and Grace!'" })).toBe(false);
    expect(sameFailure(THEN, { ...THEN, step: 'I get "Hello, Ada!"' })).toBe(false);
  });
});
