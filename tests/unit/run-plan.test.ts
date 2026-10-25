import { describe, expect, test } from "vitest";
import { gateScope, runIdOf, startingScenarios } from "../../src/run-plan.ts";

const scenario = (uri: string, line: number, name: string) => ({ uri, line, name });
const GREET_01 = scenario("features/greet-01.feature", 3, "A person is greeted by name");
const PAIR = scenario("features/greet-02.feature", 4, "Two people are greeted together");
const LIST = scenario("features/greet-02.feature", 8, "Three people are greeted as a list");
const WITH = scenario("features/greet-03.feature", 4, "A person is greeted with the chosen salutation");
const failing = (status: string, message = "") => ({ step: "a step", kind: "Outcome" as const, status, message });

describe("runIdOf", () => {
  test("names a run of one FR after it, and a run of several after the first and the last, as a name a git branch can take", () => {
    expect([runIdOf(["FR-A-01"], "20261025T120000"), runIdOf(["FR-A-01", "FR-B-02", "NFR-02"], "20261025T120000")]).toEqual(["FR-A-01-20261025T120000", "FR-A-01-to-NFR-02-20261025T120000"]);
  });
});

describe("startingScenarios", () => {
  test("of the FRs outside the run: a passing scenario is held, one with an undefined or pending step is not built yet, one that fails with its steps defined is broken", () => {
    const results = [
      { ...GREET_01, status: "passed" as const },
      { ...WITH, status: "failed" as const, failure: failing("UNDEFINED") },
      { ...scenario("features/x.feature", 2, "pending"), status: "failed" as const, failure: failing("PENDING") },
      { ...scenario("features/y.feature", 2, "broken"), status: "failed" as const, failure: failing("FAILED", "AssertionError") },
      { ...scenario("features/z.feature", 2, "ambiguous"), status: "failed" as const, failure: failing("AMBIGUOUS") },
    ];

    const start = startingScenarios(results, new Set());

    expect({ passing: [...start.passing], notBuilt: start.notBuilt.map((one) => one.name), broken: start.broken.map((one) => one.name) }).toEqual({
      passing: ["features/greet-01.feature:3"],
      notBuilt: [WITH.name, "pending"],
      broken: ["broken", "ambiguous"],
    });
  });

  test("leaves the scenarios of the FRs in the run out of the base: they fail before they are built", () => {
    const results = [{ ...PAIR, status: "failed" as const, failure: failing("FAILED", "TypeError") }, { ...LIST, status: "passed" as const }];

    const start = startingScenarios(results, new Set(["features/greet-02.feature:4", "features/greet-02.feature:8"]));

    expect({ passing: [...start.passing], notBuilt: start.notBuilt, broken: start.broken }).toEqual({ passing: [], notBuilt: [], broken: [] });
  });
});

describe("gateScope", () => {
  test("holds what passed at the start and what the run built; leaves out the rest, which it lists", () => {
    const all = [GREET_01, PAIR, LIST, WITH];

    const { scope, leftOut } = gateScope(all, new Set(["features/greet-01.feature:3"]), [PAIR, LIST]);

    expect({ scope, leftOut: leftOut.map((one) => one.name) }).toEqual({
      scope: ["features/greet-01.feature:3", "features/greet-02.feature:4", "features/greet-02.feature:8"],
      leftOut: [WITH.name],
    });
  });
});
