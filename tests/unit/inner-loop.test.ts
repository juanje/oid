import { describe, expect, test } from "vitest";
import { type Failing, innerLoop, type RoundEnd, sameFailure } from "../../src/inner-loop.ts";

const REFUSAL = { failed: "f", evidence: "e", next: "n" };
const WHEN: Failing = { step: 'I greet "Ada" and "Grace"', message: "TypeError: greetPair is not a function" };
const THEN: Failing = { step: 'I get "Hello, Ada and Grace!"', message: "AssertionError: undefined !== 'Hello, Ada and Grace!'" };

/** A loop whose rounds end as `ends` say in turn, and whose scenario fails as `failures` say after each round. */
async function loop(ends: RoundEnd<string>[], failures: (Failing | undefined)[], rounds = 6) {
  const noProgress: Failing[] = [];
  const given: (string | undefined)[] = [];
  let checks = 0;
  const end = await innerLoop(
    async (request) => {
      given.push(request);
      return ends.shift();
    },
    async () => {
      checks += 1;
      return failures.shift();
    },
    WHEN,
    rounds,
    async (failure) => {
      noProgress.push(failure);
    },
  );
  return { end, noProgress, checks, given };
}

describe("innerLoop", () => {
  test("repeats rounds until the scenario passes", async () => {
    const { end, checks } = await loop([undefined, undefined, undefined], [THEN, THEN, undefined]);

    expect({ end, checks }).toEqual({ end: { built: true }, checks: 3 });
  });

  test("ends at the first refused round, without checking the scenario", async () => {
    const { end, checks } = await loop([{ refusal: REFUSAL }], []);

    expect({ end, checks }).toEqual({ end: { refusal: REFUSAL }, checks: 0 });
  });

  test("records each round after which the scenario fails the same way, and goes on: a round with no progress spends no retry", async () => {
    // WHEN stays WHEN: no progress; WHEN → THEN moves on; THEN stays THEN, twice: no progress; then it passes.
    const { end, noProgress } = await loop([undefined, undefined, undefined, undefined, undefined], [WHEN, THEN, THEN, THEN, undefined], 10);

    expect({ end, noProgress }).toEqual({ end: { built: true }, noProgress: [WHEN, THEN, THEN] });
  });

  test("a round that ends in a request does not check the scenario: the next round starts with it, and it counts toward the limit", async () => {
    const { end, given, checks } = await loop([{ request: "steps, because of the shared step" }, undefined], [undefined]);
    const limited = await loop([{ request: "steps" }, { request: "code" }], [], 2);

    expect({ end, given, checks }).toEqual({ end: { built: true }, given: [undefined, "steps, because of the shared step"], checks: 1 });
    expect(limited.end).toEqual({ limit: WHEN });
  });

  test("stops at its limit of rounds with the last failure, however the failure moves", async () => {
    const alternating = [THEN, WHEN, THEN];

    const { end, checks } = await loop([undefined, undefined, undefined], alternating, 3);

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
