import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, expect, test } from "vitest";
import type { CommandOptions, CommandResult } from "../../src/command.ts";
import { listScenarios, runScenarios } from "../../src/scenarios.ts";
import { tempRepo } from "./support/repo.ts";

const recorded = (name: string): string => readFileSync(join(import.meta.dirname, "recorded", name), "utf8");

const FIRST = { uri: "features/greet-02.feature", line: 4, name: "Two people are greeted together" };
const SECOND = { uri: "features/greet-02.feature", line: 8, name: "Three people are greeted as a list" };

/** A cucumber-js that checks it was asked for `expected` arguments in `dir`, then writes `ndjson` as its message report. */
function recordedCucumber(dir: string, expected: string[], ndjson: string) {
  return async (command: string, args: string[], options: CommandOptions): Promise<CommandResult> => {
    expect(basename(command)).toBe("cucumber-js");
    expect(options.cwd).toBe(dir);
    expect(options.env?.NODE_OPTIONS).toBe("--import tsx");
    const format = args.indexOf("--format");
    expect(args[format + 1]).toMatch(/^message:/);
    expect(args.filter((_, index) => index !== format && index !== format + 1)).toEqual(expected);
    await writeFile(args[format + 1]!.slice("message:".length), ndjson);
    return { exitCode: 1, output: "" };
  };
}

describe("listScenarios", () => {
  test("asks cucumber-js for a dry run of the FR's tag and returns its scenarios in order", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = recordedCucumber(dir, ["--dry-run", "--tags", "@FR-GREET-02"], recorded("cucumber-greet-02-dry.ndjson"));

    expect(await listScenarios(dir, "FR-GREET-02", run)).toEqual([FIRST, SECOND]);
  });
});

describe("runScenarios", () => {
  test("runs the scenarios by location and returns each one's result", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = recordedCucumber(dir, ["features/greet-02.feature:4", "features/greet-02.feature:8"], recorded("cucumber-greet-02-run.ndjson"));

    expect(await runScenarios(dir, [FIRST, SECOND], run)).toEqual([
      { ...FIRST, status: "passed" },
      { ...SECOND, status: "failed" },
    ]);
  });

  test("never reads a report left by an earlier run when cucumber stops before writing one", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const location = ["features/greet-02.feature:4"];
    await runScenarios(dir, [FIRST], recordedCucumber(dir, location, recorded("cucumber-greet-02-run.ndjson")));
    // A step file that imports a missing module stops cucumber-js before any scenario runs, and it writes no report.
    const stopsOnLoad = async (): Promise<CommandResult> => ({ exitCode: 1, output: "Error [ERR_MODULE_NOT_FOUND]" });

    expect(await runScenarios(dir, [FIRST], stopsOnLoad)).toEqual([{ ...FIRST, status: "not run" }]);
  });

  test("reports a scenario it asked for that did not run as not run", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const missing = { uri: "features/greet-02.feature", line: 12, name: "A scenario that is not there" };
    const run = recordedCucumber(dir, ["features/greet-02.feature:4", "features/greet-02.feature:12"], recorded("cucumber-greet-02-run.ndjson"));

    expect(await runScenarios(dir, [FIRST, missing], run)).toEqual([
      { ...FIRST, status: "passed" },
      { ...missing, status: "not run" },
    ]);
  });
});
