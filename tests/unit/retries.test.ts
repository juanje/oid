import { describe, expect, test } from "vitest";
import type { Refusal } from "../../src/refusal.ts";
import { withRetries } from "../../src/retries.ts";

const refusal = (n: number): Refusal => ({ failed: `failed ${n}`, evidence: `evidence ${n}`, next: `next ${n}` });

/** An attempt that is refused `refusals` times, then accepted; it records what it was given and each rollback. */
function attemptRefused(refusals: number) {
  const given: (Refusal | undefined)[] = [];
  let rollbacks = 0;
  const once = async (previous: Refusal | undefined) => {
    given.push(previous);
    const result = given.length <= refusals ? refusal(given.length) : undefined;
    return { refusal: result, rollback: async () => void (rollbacks += 1) };
  };
  return { once, given, rollbacks: () => rollbacks };
}

describe("withRetries", () => {
  test("retries a refused attempt with its refusal, after going back, until one is accepted", async () => {
    const attempt = attemptRefused(1);

    const result = await withRetries(2, attempt.once);

    expect({ result, given: attempt.given, rollbacks: attempt.rollbacks() }).toEqual({ result: undefined, given: [undefined, refusal(1)], rollbacks: 1 });
  });

  test("returns the last refusal when the retries run out", async () => {
    const attempt = attemptRefused(5);

    const result = await withRetries(1, attempt.once);

    expect({ result, tries: attempt.given.length }).toEqual({ result: refusal(2), tries: 2 });
  });

  test("does not retry a refusal marked final, whatever the limit", async () => {
    let tries = 0;
    const once = async () => {
      tries += 1;
      return { refusal: refusal(tries), rollback: async () => {}, final: true };
    };

    expect({ result: await withRetries(3, once), tries }).toEqual({ result: refusal(1), tries: 1 });
  });

  test("does not retry when no retry is allowed", async () => {
    const attempt = attemptRefused(5);

    expect({ result: await withRetries(0, attempt.once), tries: attempt.given.length }).toEqual({ result: refusal(1), tries: 1 });
  });
});
