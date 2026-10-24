import { realpath, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { describe, expect, test } from "vitest";
import type { CommandOptions, CommandResult } from "../../src/command.ts";
import { runUnitTests } from "../../src/unit-tests.ts";
import { recorded } from "./support/recorded.ts";
import { tempRepo } from "./support/repo.ts";

/** A vitest that checks it was asked to run `files` in `dir`, then writes `report` (recorded under /work) as its JSON report. */
function recordedVitest(dir: string, files: string[], report: string | undefined) {
  return async (command: string, args: string[], options: CommandOptions): Promise<CommandResult> => {
    expect(basename(command)).toBe("vitest");
    expect(options.cwd).toBe(dir);
    const outputFile = args.find((arg) => arg.startsWith("--outputFile="));
    expect(args.filter((arg) => arg !== outputFile)).toEqual(["run", ...files, "--reporter=json"]);
    if (report !== undefined) await writeFile(outputFile!.slice("--outputFile=".length), report.replaceAll("/work", await realpath(dir)));
    return { exitCode: 1, output: "" };
  };
}

describe("runUnitTests", () => {
  test("runs the given test files and returns which tests passed and which failed", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = recordedVitest(dir, ["tests/greet-all.test.ts"], recorded("vitest-greet-02-assert.json"));

    expect(await runUnitTests(dir, ["tests/greet-all.test.ts"], run)).toMatchObject({
      ran: true,
      passed: ["tests/greet.test.ts > greets a person by name"],
      failed: ["tests/greet-all.test.ts > greets two people together"],
    });
  });

  test("runs the whole suite when given no files", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = recordedVitest(dir, [], recorded("vitest-greet-02-load.json"));

    expect(await runUnitTests(dir, [], run)).toMatchObject({ ran: true });
  });

  test("never reads a report left by an earlier run when vitest writes none", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    await runUnitTests(dir, [], recordedVitest(dir, [], recorded("vitest-greet-02-assert.json")));

    expect(await runUnitTests(dir, [], recordedVitest(dir, [], undefined))).toMatchObject({ ran: false, passed: [], failed: [] });
  });
});
