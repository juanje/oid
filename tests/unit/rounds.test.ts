import { describe, expect, test } from "vitest";
import { roundLimitMessage } from "../../src/rounds.ts";

const SCENARIO = 'features/greet-02.feature:4 "Two people are greeted together"';
const FAILING = { step: 'I get "Hello, Ada and Grace!"', message: "AssertionError: undefined !== 'Hello, Ada and Grace!'\n    at World.<anonymous> (/work/x.ts:1:1)" };
const REPORTS = new Map([
  ["steps", "Wrote the steps"],
  ["test", "The cause is in the step definitions, outside tests/"],
  ["code", "greetPair joins two names"],
] as const);

describe("roundLimitMessage", () => {
  test("names the round limit, the scenario, its last failure and the last report of each attempt kind", () => {
    const message = roundLimitMessage(SCENARIO, 6, FAILING, REPORTS);

    expect(message).toMatch(/\bround limit\b/);
    expect(message).toContain("limits.rounds");
    for (const part of [SCENARIO, FAILING.step, "AssertionError", ...REPORTS.values()]) expect(message).toContain(part);
  });
});
