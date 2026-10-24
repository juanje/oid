import { describe, expect, test } from "vitest";
import { innerLoop } from "../../src/inner-loop.ts";

const REFUSAL = { failed: "f", evidence: "e", next: "n" };

describe("innerLoop", () => {
  test("repeats rounds until the scenario passes", async () => {
    let rounds = 0;
    const results = [false, false, true];

    const refusal = await innerLoop(
      async () => {
        rounds += 1;
        return undefined;
      },
      async () => results.shift()!,
    );

    expect({ refusal, rounds }).toEqual({ refusal: undefined, rounds: 3 });
  });

  test("ends at the first refused round, without checking the scenario", async () => {
    let checks = 0;

    const refusal = await innerLoop(
      async () => REFUSAL,
      async () => {
        checks += 1;
        return false;
      },
    );

    expect({ refusal, checks }).toEqual({ refusal: REFUSAL, checks: 0 });
  });
});
