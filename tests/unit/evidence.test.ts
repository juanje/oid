import { describe, expect, test } from "vitest";
import { judgeCode, judgeNewTests, judgeSteps } from "../../src/evidence.ts";
import { recorded, recordedVitest } from "./support/recorded.ts";
import { tempRepo } from "./support/repo.ts";

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

describe("judgeCode", () => {
  const GREEN = { uri: "features/greet-01.feature", line: 4, name: "A person is greeted by name" };
  const unit = (failed: string[]) => ({ ran: true, passed: ["tests/greet.test.ts > greets a person by name"], failed, output: "" });

  test("accepts code when every unit test passes and every scenario that was green still passes", () => {
    expect(judgeCode(unit([]), [{ ...GREEN, status: "passed" }])).toBeUndefined();
  });

  test("refuses code that leaves a unit test failing, naming the test", () => {
    const refusal = judgeCode(unit(["tests/greet-all.test.ts > greets two people together"]), []);

    expect(refusal?.evidence).toContain("tests/greet-all.test.ts > greets two people together");
  });

  test("refuses code that turns a green scenario red, naming the scenario", () => {
    const refusal = judgeCode(unit([]), [{ ...GREEN, status: "failed" }]);

    expect(refusal?.evidence).toContain(GREEN.name);
  });

  test("refuses code when the unit suite did not run", () => {
    expect(judgeCode({ ran: false, passed: [], failed: [], output: "Error: Cannot find vitest" }, [])?.evidence).toContain("Cannot find vitest");
  });
});

describe("judgeNewTests", () => {
  test("refuses new tests that pass before their code, naming them", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    // In the recording, tests/greet.test.ts passes: here it stands for a new test that passes without its code.
    const run = recordedVitest(dir, ["tests/greet.test.ts"], recorded("vitest-greet-02-load.json"));

    expect((await judgeNewTests(dir, ["tests/greet.test.ts"], run))?.evidence).toContain("tests/greet.test.ts > greets a person by name");
  });

  test("accepts new tests that all fail, whatever other files of the report did", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = recordedVitest(dir, ["tests/greet-all.test.ts"], recorded("vitest-greet-02-assert.json"));

    expect(await judgeNewTests(dir, ["tests/greet-all.test.ts"], run)).toBeUndefined();
  });

  test("refuses new tests that did not run, never reading an earlier report", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    await judgeNewTests(dir, ["tests/greet-all.test.ts"], recordedVitest(dir, ["tests/greet-all.test.ts"], recorded("vitest-greet-02-assert.json")));

    expect(await judgeNewTests(dir, ["tests/greet-all.test.ts"], recordedVitest(dir, ["tests/greet-all.test.ts"], undefined))).toBeDefined();
  });
});
