import { describe, expect, test } from "vitest";
import { judgeSteps } from "../../src/evidence.ts";

const SCENARIO = { uri: "features/greet-02.feature", line: 4, name: "Two people are greeted together" };

describe("judgeSteps", () => {
  test("accepts step definitions whose scenario fails before its code", () => {
    expect(judgeSteps({ ...SCENARIO, status: "failed" })).toBeUndefined();
  });

  test("refuses step definitions whose scenario passes before its code, naming the scenario", () => {
    const refusal = judgeSteps({ ...SCENARIO, status: "passed" });

    expect(refusal?.evidence).toContain(SCENARIO.name);
  });

  test("refuses step definitions whose scenario did not run, naming the scenario", () => {
    const refusal = judgeSteps({ ...SCENARIO, status: "not run" });

    expect(refusal?.evidence).toContain(SCENARIO.name);
  });
});
