import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { scenarioResults, scenariosIn } from "../../src/cucumber-messages.ts";

// Recorded from cucumber-js 13.3.0 on FR-GREET-02 after its first scenario's code: the second scenario's steps are undefined.
const recorded = (name: string): string => readFileSync(join(import.meta.dirname, "recorded", name), "utf8");
const DRY_RUN = recorded("cucumber-greet-02-dry.ndjson");
const RUN = recorded("cucumber-greet-02-run.ndjson");

const FIRST = { uri: "features/greet-02.feature", line: 4, name: "Two people are greeted together" };
const SECOND = { uri: "features/greet-02.feature", line: 8, name: "Three people are greeted as a list" };

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
