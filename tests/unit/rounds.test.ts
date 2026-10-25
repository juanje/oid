import { describe, expect, test } from "vitest";
import { roundLimitMessage, stalledRefusal } from "../../src/rounds.ts";

const SCENARIO = 'features/greet-02.feature:4 "Two people are greeted together"';
const FAILING = { step: 'I get "Hello, Ada and Grace!"', message: "AssertionError: undefined !== 'Hello, Ada and Grace!'\n    at World.<anonymous> (/work/x.ts:1:1)" };
const REPORTS = new Map([
  ["steps", "Wrote the steps"],
  ["test", "The cause is in the step definitions, outside tests/"],
  ["code", "greetPair joins two names"],
] as const);

describe("stalledRefusal", () => {
  test("names the scenario, the step where it still fails and the failure without its stack, for the next round", () => {
    const refusal = stalledRefusal(SCENARIO, FAILING);

    expect(refusal.failed).toContain(SCENARIO);
    expect(refusal.failed).toContain(FAILING.step);
    expect(refusal.evidence).toContain("AssertionError: undefined !== 'Hello, Ada and Grace!'");
    expect(refusal.evidence).not.toContain("    at ");
  });

  test("gives the last report of each attempt kind when the run stops on it, and only then", () => {
    const last = stalledRefusal(SCENARIO, FAILING, REPORTS);

    for (const report of REPORTS.values()) expect(last.evidence).toContain(report);
    for (const report of REPORTS.values()) expect(stalledRefusal(SCENARIO, FAILING).evidence).not.toContain(report);
  });
});

describe("roundLimitMessage", () => {
  test("names the round limit, the scenario, its last failure and the last report of each attempt kind", () => {
    const message = roundLimitMessage(SCENARIO, 6, FAILING, REPORTS);

    expect(message).toMatch(/\bround limit\b/);
    expect(message).toContain("limits.rounds");
    for (const part of [SCENARIO, FAILING.step, "AssertionError", ...REPORTS.values()]) expect(message).toContain(part);
  });
});
