import { realpath, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { describe, expect, test } from "vitest";
import type { CommandOptions, CommandResult } from "../../src/command.ts";
import { tryAttempt, typeErrorsIn } from "../../src/try.ts";
import { recorded } from "./support/recorded.ts";
import { tempRepo, writeFiles } from "./support/repo.ts";

// tsc 7.0.2's answer when src/greet.ts holds a type error, and another file one the attempt did not touch.
const TSC_ERRORS = [
  "src/greet.ts(2,9): error TS2322: Type 'string' is not assignable to type 'number'.",
  "src/other.ts(5,1): error TS2304: Cannot find name 'x'.",
].join("\n");

const PASSING_REPORT = JSON.stringify({
  testResults: [{ name: "/work/tests/greet-all.test.ts", status: "passed", message: "", assertionResults: [{ fullName: "greets two people together", status: "passed" }] }],
});

describe("typeErrorsIn", () => {
  test("keeps the type errors of the given files only", () => {
    expect(typeErrorsIn(TSC_ERRORS, ["src/greet.ts"])).toEqual(["src/greet.ts(2,9): error TS2322: Type 'string' is not assignable to type 'number'."]);
  });
});

/** vitest answering with `report` (recorded under /work) and tsc with `tscOutput`, each after checking its request. */
function recordedRunners(dir: string, report: string, tscOutput: string) {
  return async (command: string, args: string[], options: CommandOptions): Promise<CommandResult> => {
    expect(options.cwd).toBe(dir);
    if (basename(command) === "tsc") {
      expect(args).toEqual(["--noEmit"]);
      return { exitCode: tscOutput === "" ? 0 : 2, output: tscOutput };
    }
    expect(basename(command)).toBe("vitest");
    const outputFile = args.find((arg) => arg.startsWith("--outputFile="))!;
    expect(args.filter((arg) => arg !== outputFile)).toEqual(["run", "tests/greet-all.test.ts", "--reporter=json"]);
    await writeFile(outputFile.slice("--outputFile=".length), report.replaceAll("/work", await realpath(dir)));
    return { exitCode: 0, output: "" };
  };
}

const SCENARIO = { uri: "features/greet-02.feature", line: 4, name: "Two people are greeted together" };
const TEST = { test: "tests/greet-all.test.ts" };

describe("tryAttempt", () => {
  test("answers a failing test with what failed, the evidence and the next step", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    await writeFiles(dir, { "tests/greet-all.test.ts": "x\n" });

    const result = await tryAttempt(dir, SCENARIO, TEST, recordedRunners(dir, recorded("vitest-greet-02-assert.json"), ""));

    expect(result).toMatchObject({ passed: false, evidence: expect.stringContaining("tests/greet-all.test.ts > greets two people together") });
    expect(result.passed === false && result.next).not.toBe("");
  });

  test("fails on a type error in a file the attempt changed, naming the type check and the file, not other files", async () => {
    const dir = await tempRepo({ "src/greet.ts": "export {};\n" });
    await writeFiles(dir, { "src/greet.ts": "export const x: number = '';\n", "tests/greet-all.test.ts": "x\n" });

    const result = await tryAttempt(dir, SCENARIO, TEST, recordedRunners(dir, PASSING_REPORT, TSC_ERRORS));

    expect(result).toMatchObject({ passed: false, failed: expect.stringMatching(/types/), evidence: expect.stringContaining("src/greet.ts(2,9)") });
    expect(result.passed === false && result.evidence).not.toContain("src/other.ts");
  });

  test("passes when the test passes and no file the attempt changed has a type error", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    await writeFiles(dir, { "tests/greet-all.test.ts": "x\n" });

    expect(await tryAttempt(dir, SCENARIO, TEST, recordedRunners(dir, PASSING_REPORT, "src/other.ts(5,1): error TS2304: Cannot find name 'x'."))).toEqual({ passed: true });
  });
});
