import { describe, expect, test } from "vitest";
import { scenarioResults, scenariosIn } from "../../src/cucumber-messages.ts";
import { GREET_02_FIRST as FIRST, GREET_02_SECOND as SECOND, recorded } from "./support/recorded.ts";

// Recorded from cucumber-js 13.3.0 on FR-GREET-02 after its first scenario's code: the second scenario's steps are undefined.
const DRY_RUN = recorded("cucumber-greet-02-dry.ndjson");
const RUN = recorded("cucumber-greet-02-run.ndjson");

describe("scenariosIn", () => {
  test("lists the scenarios of a run in file order, with where they are", () => {
    expect(scenariosIn(DRY_RUN)).toEqual([FIRST, SECOND]);
  });
});

describe("scenarioResults", () => {
  test("passes a scenario whose every step passed, and fails one at its first step that did not pass", () => {
    expect(scenarioResults(RUN)).toEqual([
      { ...FIRST, status: "passed" },
      {
        ...SECOND,
        status: "failed",
        failure: { step: 'I greet "Ada", "Grace" and "Linus"', kind: "Action", status: "UNDEFINED", message: "" },
      },
    ]);
  });

  test("keeps the error type in the message of a failed step", () => {
    // Recorded with FR-GREET-02's second scenario failing on an assertion in its Then step.
    const [result] = scenarioResults(recorded("cucumber-greet-02-assertion.ndjson"));

    expect(result?.failure?.message).toMatch(/^AssertionError \[ERR_ASSERTION\]: Expected values to be strictly equal/);
  });

  test("fails a scenario with an undefined step at that step, even when an earlier step failed", () => {
    // Recorded with FR-GREET-03: its When fails on missing code, its Then has no step definition.
    const [result] = scenarioResults(recorded("cucumber-greet-03-undefined-then.ndjson"));

    expect(result?.failure).toEqual({ step: 'the greeting is "Good morning, Ada!"', kind: "Outcome", status: "UNDEFINED", message: "" });
  });

  test("names the file that defines the step a scenario failed at", () => {
    // Recorded with FR-GREET-03: its When fails because greet.ts does not export greetWith yet.
    const [result] = scenarioResults(recorded("cucumber-greet-03-when-fails.ndjson"));

    expect(result?.failure).toMatchObject({
      step: 'I greet "Ada" with it',
      kind: "Action",
      status: "FAILED",
      definedIn: "features/steps/greet-with.steps.ts",
    });
  });

  test("leaves out a scenario that never started", () => {
    const picklesOnly = RUN.split("\n").filter((line) => line.startsWith('{"pickle"')).join("\n");

    expect(scenarioResults(picklesOnly)).toEqual([]);
  });
});
