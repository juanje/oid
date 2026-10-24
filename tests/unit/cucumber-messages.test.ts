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
  test("passes a scenario whose every step passed, and fails one with an undefined step", () => {
    expect(scenarioResults(RUN)).toEqual([
      { ...FIRST, status: "passed" },
      { ...SECOND, status: "failed" },
    ]);
  });

  test("leaves out a scenario that never started", () => {
    const picklesOnly = RUN.split("\n").filter((line) => line.startsWith('{"pickle"')).join("\n");

    expect(scenarioResults(picklesOnly)).toEqual([]);
  });
});
