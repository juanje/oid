import { readFileSync } from "node:fs";
import { realpath, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { expect } from "vitest";
import type { CommandOptions, CommandResult } from "../../../src/command.ts";

/** A runner's output recorded from the real tool, under tests/unit/recorded. */
export function recorded(name: string): string {
  return readFileSync(join(import.meta.dirname, "../recorded", name), "utf8");
}

// The scenarios of FR-GREET-02, as cucumber-js 13.3.0 reported them in the recordings.
export const GREET_02_FIRST = { uri: "features/greet-02.feature", line: 4, name: "Two people are greeted together" };
export const GREET_02_SECOND = { uri: "features/greet-02.feature", line: 8, name: "Three people are greeted as a list" };

/** A vitest that checks it was asked to run `files` in `dir`, then writes `report` (recorded under /work) as its JSON report. */
export function recordedVitest(dir: string, files: string[], report: string | undefined) {
  return async (command: string, args: string[], options: CommandOptions): Promise<CommandResult> => {
    expect(basename(command)).toBe("vitest");
    expect(options.cwd).toBe(dir);
    const outputFile = args.find((arg) => arg.startsWith("--outputFile="));
    expect(args.filter((arg) => arg !== outputFile)).toEqual(["run", ...files, "--reporter=json"]);
    if (report !== undefined) await writeFile(outputFile!.slice("--outputFile=".length), report.replaceAll("/work", await realpath(dir)));
    return { exitCode: 1, output: "" };
  };
}
