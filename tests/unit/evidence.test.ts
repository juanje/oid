import { describe, expect, test } from "vitest";
import { judgeCode, judgeNewTests, judgeSteps, noTestSuiteFiles } from "../../src/evidence.ts";
import { nothingExists } from "./support/symbols.ts";
import { recorded, recordedVitest } from "./support/recorded.ts";
import { tempRepo } from "./support/repo.ts";

const SCENARIO = { uri: "features/greet-03.feature", line: 4, name: "A person is greeted with the chosen salutation" };

describe("judgeSteps", () => {
  test("accepts step definitions whose scenario fails with a valid Red, giving its class", () => {
    const failure = { step: 'I greet "Ada" with it', kind: "Action" as const, status: "FAILED", message: "TypeError: greetWith is not a function" };

    const judgment = judgeSteps({ ...SCENARIO, status: "failed", failure }, nothingExists);

    expect(judgment.refusal).toBeUndefined();
    expect(judgment.reds).toEqual([`${SCENARIO.uri}:${SCENARIO.line} "${SCENARIO.name}": missing_implementation`]);
  });

  test("accepts step definitions whose scenario fails in a way oid cannot classify, provisionally", () => {
    const failure = { step: 'I greet "Ada" with it', kind: "Action" as const, status: "FAILED", message: "Error: greetWith is not there yet" };

    const judgment = judgeSteps({ ...SCENARIO, status: "failed", failure }, nothingExists);

    expect(judgment).toEqual({ refusal: undefined, reds: [`${SCENARIO.uri}:${SCENARIO.line} "${SCENARIO.name}": undecided (provisional)`] });
  });

  test("refuses a scenario that fails while being set up, naming the step and pointing at When and Then", () => {
    const failure = { step: 'the salutation is "Good morning"', kind: "Context" as const, status: "FAILED", message: "TypeError: setSalutation is not a function" };

    const { refusal } = judgeSteps({ ...SCENARIO, status: "failed", failure }, nothingExists);

    expect(refusal?.evidence).toContain(failure.step);
    expect(refusal?.next).toContain("When or Then");
  });

  test("refuses step definitions whose scenario passes before its code, naming the scenario", () => {
    const { refusal } = judgeSteps({ ...SCENARIO, status: "passed" }, nothingExists);

    expect(refusal?.evidence).toContain(SCENARIO.name);
  });

  test("offers a mutant for a scenario that passes before its code only where one is accepted", () => {
    const offered = judgeSteps({ ...SCENARIO, status: "passed" }, nothingExists, { offerMutant: true }).refusal;
    const not = judgeSteps({ ...SCENARIO, status: "passed" }, nothingExists).refusal;

    expect([offered?.next, not?.next]).toEqual([expect.stringMatching(/\bmutant\b/), expect.not.stringMatching(/\bmutant\b/)]);
  });

  test("refuses step definitions whose scenario did not run, naming the scenario", () => {
    const { refusal } = judgeSteps({ ...SCENARIO, status: "not run" }, nothingExists);

    expect(refusal?.evidence).toContain(SCENARIO.name);
  });
});

describe("judgeCode", () => {
  const GREEN = { uri: "features/greet-01.feature", line: 4, name: "A person is greeted by name" };
  const unit = (failed: string[]) => ({ ran: true, passed: ["tests/greet.test.ts > greets a person by name"], failed, output: "" });

  test("refuses code under which the unit suite did not finish within the time limit, saying so", () => {
    const refusal = judgeCode({ ran: false, passed: [], failed: [], output: "", stoppedAfter: 5 }, []);

    expect(`${refusal?.failed}\n${refusal?.evidence}`).toContain("did not finish within 5 s");
  });

  test("accepts code when every unit test passes and every scenario that was green still passes", () => {
    expect(judgeCode(unit([]), [{ ...GREEN, status: "passed" }])).toBeUndefined();
  });

  test("sends a test file that registers no vitest test back to a test attempt, naming it and pointing to vitest", () => {
    const message = "No test suite found in file /work/tests/greet-all.test.ts";
    const refusal = judgeCode({ ...unit(["tests/greet-all.test.ts"]), failures: [{ test: "tests/greet-all.test.ts", message }] }, []);

    expect(refusal?.sendTo).toBe("test");
    expect(`${refusal?.failed}\n${refusal?.evidence}`).toContain("tests/greet-all.test.ts");
    expect(refusal?.next).toMatch(/\bvitest\b/);
  });

  test("refuses code that leaves a unit test failing, naming the test", () => {
    const refusal = judgeCode(unit(["tests/greet-all.test.ts > greets two people together"]), []);

    expect(refusal?.evidence).toContain("tests/greet-all.test.ts > greets two people together");
  });

  test("gives each failing test's message as the evidence, so that a retry sees why it fails", () => {
    const failing = { test: "tests/greet.test.ts > greets a person by name", message: "AssertionError: expected 'Hi, Ada!' to be 'Hello, Ada!'" };

    const refusal = judgeCode({ ran: true, passed: [], failed: [failing.test], failures: [failing], output: "" }, []);

    expect(refusal?.evidence).toContain(`${failing.test}: ${failing.message}`);
  });

  test("refuses code that turns a green scenario red, naming the scenario", () => {
    const refusal = judgeCode(unit([]), [{ ...GREEN, status: "failed" }]);

    expect(refusal?.evidence).toContain(GREEN.name);
  });

  test("refuses code when the unit suite did not run", () => {
    expect(judgeCode({ ran: false, passed: [], failed: [], output: "Error: Cannot find vitest" }, [])?.evidence).toContain("Cannot find vitest");
  });
});

const NONE_KNOWN = new Set<string>();

describe("judgeNewTests", () => {
  test("judges only the tests that were not there before the attempt, in files that also hold older ones", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const files = ["tests/greet.test.ts", "tests/greet-all.test.ts"];
    // In the recording, tests/greet.test.ts passes and tests/greet-all.test.ts fails on an assertion.
    const run = recordedVitest(dir, files, recorded("vitest-greet-02-assert.json"));

    const judgment = await judgeNewTests(dir, files, run, nothingExists, new Set(["tests/greet.test.ts > greets a person by name"]));

    expect(judgment).toEqual({ refusal: undefined, reds: ["tests/greet-all.test.ts > greets two people together: business_assertion"] });
  });

  test("offers a mutant for new tests that pass before their code only where one is accepted", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const judge = (offerMutant: boolean) =>
      judgeNewTests(dir, ["tests/greet.test.ts"], recordedVitest(dir, ["tests/greet.test.ts"], recorded("vitest-greet-02-load.json")), nothingExists, NONE_KNOWN, { offerMutant });

    expect([(await judge(true)).refusal?.next, (await judge(false)).refusal?.next]).toEqual([expect.stringMatching(/\bmutant\b/), expect.not.stringMatching(/\bmutant\b/)]);
  });

  test("refuses new tests that pass before their code, naming them", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    // In the recording, tests/greet.test.ts passes: here it stands for a new test that passes without its code.
    const run = recordedVitest(dir, ["tests/greet.test.ts"], recorded("vitest-greet-02-load.json"));

    const { refusal } = await judgeNewTests(dir, ["tests/greet.test.ts"], run, nothingExists, NONE_KNOWN);

    expect(refusal?.evidence).toContain("tests/greet.test.ts > greets a person by name");
  });

  test("accepts new tests that all fail with a valid Red, giving each one's class, whatever other files of the report did", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = recordedVitest(dir, ["tests/greet-all.test.ts"], recorded("vitest-greet-02-assert.json"));

    const judgment = await judgeNewTests(dir, ["tests/greet-all.test.ts"], run, nothingExists, NONE_KNOWN);

    expect(judgment).toEqual({ refusal: undefined, reds: ["tests/greet-all.test.ts > greets two people together: business_assertion"] });
  });

  test("accepts new tests that fail in a way oid cannot classify, provisionally", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const report = recorded("vitest-greet-02-assert.json").replace(/AssertionError: [^"]*/, "Error: greetAll is not there yet");
    const run = recordedVitest(dir, ["tests/greet-all.test.ts"], report);

    const judgment = await judgeNewTests(dir, ["tests/greet-all.test.ts"], run, nothingExists, NONE_KNOWN);

    expect(judgment).toEqual({ refusal: undefined, reds: ["tests/greet-all.test.ts > greets two people together: undecided (provisional)"] });
  });

  test("refuses a new test that looks for a module outside the source as test_bug, giving the path it resolves to", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const report = recorded("vitest-greet-02-load.json").replaceAll("'../src/greet-all.ts'", "'../lib/greet-all.ts'");
    const run = recordedVitest(dir, ["tests/greet-all.test.ts"], report);

    const { refusal } = await judgeNewTests(dir, ["tests/greet-all.test.ts"], run, nothingExists, NONE_KNOWN, { source: ["src/"] });

    expect(refusal?.failed).toContain("test_bug");
    expect(refusal?.evidence).toMatch(/\blib\/greet-all\.ts\b.*\bnot under\b.*\bsrc\//);
  });

  test("refuses a new test file the report does not mention as not_run, naming it", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    // The recording covers other files only: vitest did not collect this one.
    const run = recordedVitest(dir, ["tests/greet-with.ts"], recorded("vitest-greet-02-load.json"));

    const { refusal } = await judgeNewTests(dir, ["tests/greet-with.ts"], run, nothingExists, NONE_KNOWN);

    expect(refusal?.failed).toContain("not_run");
    expect(refusal?.evidence).toContain("tests/greet-with.ts");
  });

  test("refuses new tests that did not run, never reading an earlier report", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const files = ["tests/greet-all.test.ts"];
    await judgeNewTests(dir, files, recordedVitest(dir, files, recorded("vitest-greet-02-assert.json")), nothingExists, NONE_KNOWN);

    expect((await judgeNewTests(dir, files, recordedVitest(dir, files, undefined), nothingExists, NONE_KNOWN)).refusal).toBeDefined();
  });
});

describe("noTestSuiteFiles", () => {
  test("names the test files that register no vitest test: they are not tests there are", () => {
    const unit = {
      ran: true,
      passed: [],
      failed: ["tests/greet-all.test.ts", "tests/greet.test.ts > greets"],
      failures: [
        { test: "tests/greet-all.test.ts", message: "No test suite found in file /work/tests/greet-all.test.ts" },
        { test: "tests/greet.test.ts > greets", message: "AssertionError: expected 1 to be 2" },
      ],
      output: "",
    };

    expect(noTestSuiteFiles(unit)).toEqual(["tests/greet-all.test.ts"]);
  });
});
