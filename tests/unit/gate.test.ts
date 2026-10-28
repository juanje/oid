import { realpath, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { describe, expect, test } from "vitest";
import type { CommandOptions, CommandResult } from "../../src/command.ts";
import { gateError, gateRefusal, runGate } from "../../src/gate.ts";
import { GREET_02_SECOND, recorded } from "./support/recorded.ts";
import { tempRepo } from "./support/repo.ts";

const TYPE_ERROR = "src/a.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.";
const PASSING_UNIT = JSON.stringify({ testResults: [{ name: "/work/tests/a.test.ts", status: "passed", message: "", assertionResults: [{ fullName: "a", status: "passed" }] }] });
const NO_TEST = JSON.stringify({ numTotalTests: 0, testResults: [] });

interface Replies {
  tsc: CommandResult;
  /** vitest's JSON report, recorded under /work, and its output. */
  vitest: { report: string; output?: string };
  /** cucumber-js's message report. */
  cucumber: { report: string; output?: string };
}

/** The gate's runners answering as recorded, after checking each request is the one that runner answers. */
function runnersAnswering(dir: string, replies: Replies) {
  return async (command: string, args: string[], options: CommandOptions): Promise<CommandResult> => {
    expect(options.cwd).toBe(dir);
    switch (basename(command)) {
      case "tsc":
        expect(args).toEqual(["--noEmit"]);
        return replies.tsc;
      case "vitest": {
        const outputFile = args.find((arg) => arg.startsWith("--outputFile="))!;
        expect(args.filter((arg) => arg !== outputFile)).toEqual(["run", "--reporter=json"]);
        await writeFile(outputFile.slice("--outputFile=".length), replies.vitest.report.replaceAll("/work", await realpath(dir)));
        return { exitCode: 0, output: replies.vitest.output ?? "" };
      }
      case "cucumber-js": {
        expect(options.env?.NODE_OPTIONS).toBe("--import tsx");
        expect(args[0]).toBe("--format");
        await writeFile(args[1]!.slice("message:".length), replies.cucumber.report);
        return { exitCode: 0, output: replies.cucumber.output ?? "" };
      }
      default:
        throw new Error(`Unexpected command ${command}`);
    }
  };
}

// Recorded from cucumber-js 13.3.0 on a built FR-GREET-01: its one scenario passes.
const CUCUMBER_PASSED = recorded("cucumber-greet-01-passed.ndjson");

describe("runGate", () => {
  test("runs types, the unit suite and the scenarios over the project, each passing or failing", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = runnersAnswering(dir, { tsc: { exitCode: 2, output: TYPE_ERROR }, vitest: { report: PASSING_UNIT }, cucumber: { report: CUCUMBER_PASSED } });

    const checks = await runGate(dir, run);

    expect(checks.map(({ name, passed }) => ({ name, passed }))).toEqual([
      { name: "types", passed: false },
      { name: "unit", passed: true },
      { name: "scenarios", passed: true },
    ]);
  });

  test("a failing test fails the unit check, with its message", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = runnersAnswering(dir, { tsc: { exitCode: 0, output: "" }, vitest: { report: recorded("vitest-greet-02-assert.json") }, cucumber: { report: CUCUMBER_PASSED } });

    const unit = (await runGate(dir, run))[1]!;

    expect(unit).toMatchObject({ name: "unit", passed: false, failures: [expect.stringContaining("tests/greet-all.test.ts > greets two people together: AssertionError")] });
  });

  test("a failing scenario fails the scenarios check, with the scenario it is", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    // Recorded with FR-GREET-02's second scenario failing on an assertion.
    const run = runnersAnswering(dir, { tsc: { exitCode: 0, output: "" }, vitest: { report: PASSING_UNIT }, cucumber: { report: recorded("cucumber-greet-02-assertion.ndjson") } });

    const scenarios = (await runGate(dir, run))[2]!;

    expect(scenarios).toMatchObject({ name: "scenarios", passed: false, failedScenarios: [{ uri: GREET_02_SECOND.uri, line: GREET_02_SECOND.line, name: GREET_02_SECOND.name }] });
  });
});

describe("runGate, what the loop sends back", () => {
  test("a type error gives the files it is in, each once", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const output = [TYPE_ERROR, "src/a.ts(2,1): error TS2304: Cannot find name 'x'.", "tests/a.test.ts(3,9): error TS2322: Type 'string' is not assignable to type 'number'.", "  Some detail line."].join("\n");
    const run = runnersAnswering(dir, { tsc: { exitCode: 2, output }, vitest: { report: PASSING_UNIT }, cucumber: { report: CUCUMBER_PASSED } });

    expect((await runGate(dir, run))[0]).toMatchObject({ name: "types", passed: false, failedFiles: ["src/a.ts", "tests/a.test.ts"] });
  });

  test("the unit check counts the tests it ran, passing or failing", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = runnersAnswering(dir, { tsc: { exitCode: 0, output: "" }, vitest: { report: recorded("vitest-greet-02-assert.json") }, cucumber: { report: CUCUMBER_PASSED } });
    const report = JSON.parse(recorded("vitest-greet-02-assert.json")) as { testResults: { assertionResults: unknown[] }[] };

    expect((await runGate(dir, run))[1]!.tests).toBe(report.testResults.flatMap((file) => file.assertionResults).length);
  });
});

describe("runGate, a check that ran nothing", () => {
  test("fails the unit and scenario checks that ran no test, whatever their runners' exit codes", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = runnersAnswering(dir, { tsc: { exitCode: 0, output: "" }, vitest: { report: NO_TEST }, cucumber: { report: "" } });

    const checks = await runGate(dir, run);

    expect(checks.map(({ name, passed, ranNothing }) => ({ name, passed, ranNothing: ranNothing ?? false }))).toEqual([
      { name: "types", passed: true, ranNothing: false },
      { name: "unit", passed: false, ranNothing: true },
      { name: "scenarios", passed: false, ranNothing: true },
    ]);
  });

  test("fails a type check that found no file to check", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const tsc = { exitCode: 2, output: "error TS18003: No inputs were found in config file '/work/tsconfig.json'." };
    const run = runnersAnswering(dir, { tsc, vitest: { report: PASSING_UNIT }, cucumber: { report: CUCUMBER_PASSED } });

    expect((await runGate(dir, run))[0]).toMatchObject({ name: "types", passed: false, ranNothing: true });
  });
});

describe("gateError", () => {
  test("a runner that does not know an option is an error that names the check and the option", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const tsc = { exitCode: 2, output: "tsconfig.json(13,5): error TS5023: Unknown compiler option 'noSuchCompilerOption'.\n" };
    const run = runnersAnswering(dir, { tsc, vitest: { report: PASSING_UNIT }, cucumber: { report: CUCUMBER_PASSED } });

    const error = gateError(await runGate(dir, run));

    expect(error).toContain("types");
    expect(error).toContain("noSuchCompilerOption");
  });

  test("a check that could not read what its runner wrote is an error that names the check and why", () => {
    const error = gateError([{ name: "coverage", passed: false, output: "", error: "oid cannot map the scenarios' coverage of src/greet.ts" }]);

    expect(error).toContain("coverage");
    expect(error).toContain("src/greet.ts");
  });

  test("no error when every runner knew its options", () => {
    expect(gateError([{ name: "types", passed: false, output: TYPE_ERROR }])).toBeUndefined();
  });
});

describe("gateRefusal", () => {
  test("names each failed check and gives its output as the evidence", () => {
    const refusal = gateRefusal([
      { name: "types", passed: false, output: TYPE_ERROR },
      { name: "unit", passed: true, output: "" },
    ]);

    expect(refusal?.failed).toContain("types");
    expect(refusal?.failed).not.toContain("unit");
    expect(refusal?.evidence).toContain(TYPE_ERROR);
  });

  test("sent to a test attempt for an uncovered branch, asks for a test with a mutant when a requirement states the branch, and for a report when none does", () => {
    const branch = "src/greet.ts:3:10: branch 0 of a conditional expression";
    const refusal = gateRefusal([{ name: "unit", passed: true, output: "" }, { name: "coverage", passed: false, output: branch, failures: [branch] }], "test");

    expect(refusal?.uncovered).toEqual([branch]);
    expect(refusal?.next).toMatch(/\bmutant\b/);
    expect(refusal?.next).toMatch(/\breport\b/);
  });

  test("marks itself as the gate's, so that the task of the attempt it goes back to opens with its job", () => {
    expect(gateRefusal([{ name: "types", passed: false, output: TYPE_ERROR }])?.from).toBe("gate");
  });

  test("puts the failing scenarios and tests in focus, whatever scenario the next attempt belongs to", () => {
    const broken = { ...GREET_02_SECOND, status: "failed" as const };

    const refusal = gateRefusal([
      { name: "unit", passed: false, output: "", failures: ["tests/greet.test.ts > greets: AssertionError"], failedTests: ["tests/greet.test.ts > greets"] },
      { name: "scenarios", passed: false, output: "", failures: ["…"], failedScenarios: [broken] },
    ]);

    expect(refusal?.focus).toEqual({ scenarios: [GREET_02_SECOND], tests: ["tests/greet.test.ts > greets"] });
  });

  test("gives each failing scenario in focus with its steps and its failure, when the gate has them", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    // Recorded with FR-GREET-02's second scenario failing on an assertion.
    const run = runnersAnswering(dir, { tsc: { exitCode: 0, output: "" }, vitest: { report: PASSING_UNIT }, cucumber: { report: recorded("cucumber-greet-02-assertion.ndjson") } });

    const focus = gateRefusal(await runGate(dir, run))?.focus;

    expect(focus?.scenarios).toMatchObject([
      {
        name: GREET_02_SECOND.name,
        steps: ['When I greet "Ada", "Grace" and "Linus"', 'Then I get "Hello, Ada, Grace and Linus!"'],
        failure: { step: 'I get "Hello, Ada, Grace and Linus!"', message: expect.stringContaining("AssertionError") },
      },
    ]);
  });

  test("refuses nothing when every check passes", () => {
    expect(gateRefusal([{ name: "types", passed: true, output: "" }])).toBeUndefined();
  });
});
