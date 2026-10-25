import { describe, expect, test } from "vitest";
import { progressLine } from "../../src/progress.ts";
import type { LogEvent } from "../../src/run-log.ts";

const SCENARIO = "A person is greeted by name";
const ended = (kind: "steps" | "test" | "code", extra: Partial<Extract<LogEvent, { event: "attempt" }>> = {}): LogEvent => ({
  event: "attempt",
  kind,
  scenario: SCENARIO,
  verdict: "accepted",
  retry: false,
  turns: 1,
  ...extra,
});

describe("progressLine", () => {
  test("says when each stage starts, with its name", () => {
    for (const stage of ["agent", "worktree", "scenarios", "unit tests", "gate", "commit"] as const) {
      expect(progressLine({ event: "stage", stage })).toMatch(new RegExp(`^stage ${stage}: `));
    }
  });

  test("says when an attempt starts, with its kind and scenario, and whether it is a retry", () => {
    expect(progressLine({ event: "attempting", kind: "code", scenario: SCENARIO, retry: false })).toBe(`attempt code for "${SCENARIO}"`);
    expect(progressLine({ event: "attempting", kind: "code", scenario: SCENARIO, retry: true })).toMatch(new RegExp(`^attempt code for "${SCENARIO}", .*retry`));
  });

  test("says how an attempt ended, and a refused one why", () => {
    expect(progressLine(ended("code"))).toBe(`attempt code for "${SCENARIO}": accepted`);
    const refusal = { failed: "Unit tests fail after the code", evidence: "…", next: "…" };
    expect(progressLine(ended("code", { verdict: "refused", refusal }))).toBe(`attempt code for "${SCENARIO}": refused: ${refusal.failed}`);
  });

  test("gives each Red of an accepted attempt as the scenario's for a steps attempt, and a unit test's for a test attempt", () => {
    const scenarioRed = `features/greet-01.feature:4 "${SCENARIO}": missing_implementation`;
    const testRed = "tests/greet.test.ts > greets a person by name: missing_implementation";

    expect(progressLine(ended("steps", { reds: [scenarioRed] }))?.split("\n")[1]).toBe(`  Red of the scenario ${scenarioRed}`);
    expect(progressLine(ended("test", { reds: [testRed] }))?.split("\n")[1]).toBe(`  Red of a unit test ${testRed}`);
  });

  test("says when a provisional Red is confirmed or refuted, by the attempt's transcript number", () => {
    expect(progressLine({ event: "red", what: "tests/a.test.ts > a", verdict: "confirmed", attempt: 5 })).toBe("  Red confirmed by attempt 05: tests/a.test.ts > a");
    expect(progressLine({ event: "red", what: "tests/a.test.ts > a", verdict: "refuted", attempt: 12 })).toBe("  Red refuted by attempt 12: tests/a.test.ts > a");
  });

  test("says when a round makes no progress, with the step where the scenario still fails", () => {
    expect(progressLine({ event: "round", scenario: SCENARIO, verdict: "no progress", step: 'I get "Hello, Ada!"', failure: "AssertionError: undefined" })).toBe(
      `round for "${SCENARIO}": no progress, still failing at step "I get \"Hello, Ada!\""`,
    );
  });

  test("says when an attempt asks for another kind, with its reason", () => {
    expect(progressLine({ event: "request", scenario: SCENARIO, by: "code", kind: "steps", reason: "The shared Then step checks the wrong greeting" })).toBe(
      `request for "${SCENARIO}": the code attempt asks for a steps attempt: The shared Then step checks the wrong greeting`,
    );
  });

  test("gives no line for the events the summary covers", () => {
    expect(progressLine({ event: "stop", limit: "turns" })).toBeUndefined();
  });
});
