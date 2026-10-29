import { describe, expect, test } from "vitest";
import { scenarioResults, scenarioSteps, scenariosIn } from "../../src/cucumber-messages.ts";
import { GREET_02_FIRST as FIRST, GREET_02_SECOND as SECOND, recorded } from "./support/recorded.ts";

// Recorded from cucumber-js 13.3.0 on FR-GREET-02 after its first scenario's code: the second scenario's steps are undefined.
const DRY_RUN = recorded("cucumber-greet-02-dry.ndjson");
const RUN = recorded("cucumber-greet-02-run.ndjson");

describe("scenariosIn", () => {
  test("lists the scenarios of a run in file order, with where they are", () => {
    expect(scenariosIn(DRY_RUN)).toEqual([FIRST, SECOND]);
  });
});

describe("scenarioSteps", () => {
  test("gives each scenario's steps, with the keyword of their kind, by where the scenario is", () => {
    const steps = scenarioSteps(DRY_RUN);

    expect(steps.get(`${FIRST.uri}:${FIRST.line}`)).toEqual(['When I greet "Ada" and "Grace"', 'Then I get "Hello, Ada and Grace!"']);
    expect(steps.get(`${SECOND.uri}:${SECOND.line}`)).toEqual(['When I greet "Ada", "Grace" and "Linus"', 'Then I get "Hello, Ada, Grace and Linus!"']);
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

  test("fails a scenario that started and did not finish, at its first step that did not finish", () => {
    // The report as a run stopped while the first scenario's Then step ran: its When step had passed.
    const cut = RUN.trimEnd().split("\n").slice(0, 7).join("\n");

    expect(scenarioResults(cut)).toEqual([{ ...FIRST, status: "failed", failure: { step: 'I get "Hello, Ada and Grace!"', kind: "Outcome", status: "NOT FINISHED", message: "" } }]);
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

  test("names the file and the line that define the step a scenario failed at", () => {
    // Recorded with FR-GREET-03: its When fails because greet.ts does not export greetWith yet.
    const [result] = scenarioResults(recorded("cucumber-greet-03-when-fails.ndjson"));

    expect(result?.failure).toMatchObject({
      step: 'I greet "Ada" with it',
      kind: "Action",
      status: "FAILED",
      definedIn: "features/steps/greet-with.steps.ts",
      definedAt: 13,
    });
  });

  test("gives the files that define the scenario's steps", () => {
    // Recorded with FR-GREET-03: its steps are defined in greet-with.steps.ts.
    const [result] = scenarioResults(recorded("cucumber-greet-03-when-fails.ndjson"));

    expect(result?.stepFiles).toEqual(["features/steps/greet-with.steps.ts"]);
  });

  test("leaves out a scenario that never started", () => {
    const picklesOnly = RUN.split("\n").filter((line) => line.startsWith('{"pickle"')).join("\n");

    expect(scenarioResults(picklesOnly)).toEqual([]);
  });
});
