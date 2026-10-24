import { existsSync } from "node:fs";
import { readFile, realpath, rm } from "node:fs/promises";
import { type CommandRunner, projectBin } from "./command.ts";
import { reportPath } from "./git.ts";
import { failedTests, passedTests, type TestFailure, testFailures } from "./vitest-report.ts";

export interface UnitRun {
  /** False when vitest wrote no report: nothing it says counts. */
  ran: boolean;
  passed: string[];
  failed: string[];
  /** Each failed test or test file with its message; present when vitest ran. */
  failures?: TestFailure[];
  output: string;
}

/** Runs the given test files with the project's vitest, or the whole suite when there are none. */
export async function runUnitTests(dir: string, files: string[], run: CommandRunner): Promise<UnitRun> {
  const report = await reportPath(dir, "oid-unit-tests.json");
  await rm(report, { force: true });
  const { output } = await run(projectBin(dir, "vitest"), ["run", ...files, "--reporter=json", `--outputFile=${report}`], { cwd: dir });
  if (!existsSync(report)) return { ran: false, passed: [], failed: [], output };
  const parsed = JSON.parse(await readFile(report, "utf8"));
  // vitest reports real paths, and the worktree may sit behind a symlink such as macOS's /var.
  const root = await realpath(dir);
  return { ran: true, passed: passedTests(parsed, root), failed: failedTests(parsed, root), failures: testFailures(parsed, root), output };
}
