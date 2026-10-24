import { existsSync } from "node:fs";
import { readFile, realpath, rm } from "node:fs/promises";
import { type CommandRunner, projectBin } from "./command.ts";
import { reportPath } from "./git.ts";
import { failedTests, passedTests, type TestFailure, testFailures } from "./vitest-report.ts";
import { WRITABLE } from "./boundaries.ts";
import { RUNNERS } from "./runners.ts";

// The source the FR's code is in: what the coverage of its new branches looks at.
const [SOURCE] = WRITABLE.code;

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
export async function runUnitTests(dir: string, files: string[], run: CommandRunner, coverageDir?: string): Promise<UnitRun> {
  const report = await reportPath(dir, "oid-unit-tests.json");
  await rm(report, { force: true });
  // With a coverage dir, vitest's provider writes the source's coverage there as istanbul JSON (FR-GATE-02).
  const coverage =
    coverageDir === undefined
      ? []
      : ["--coverage.enabled", "--coverage.provider=v8", "--coverage.reporter=json", `--coverage.reportsDirectory=${coverageDir}`, `--coverage.include=${SOURCE}**`];
  const { output } = await run(projectBin(dir, RUNNERS.unit.bin), ["run", ...files, "--reporter=json", `--outputFile=${report}`, ...coverage], { cwd: dir });
  if (!existsSync(report)) return { ran: false, passed: [], failed: [], output };
  const parsed = JSON.parse(await readFile(report, "utf8"));
  // vitest reports real paths, and the worktree may sit behind a symlink such as macOS's /var.
  const root = await realpath(dir);
  return { ran: true, passed: passedTests(parsed, root), failed: failedTests(parsed, root), failures: testFailures(parsed, root), output };
}

/** Every test and test file a unit run reported on. */
export function testsIn(unit: UnitRun): Set<string> {
  return new Set([...unit.passed, ...(unit.failures ?? []).map((failure) => failure.test)]);
}

/** Whether `test` (`<file> > <name>`, or a file alone) is in `file`. */
export function isInFile(test: string, file: string): boolean {
  return test === file || test.startsWith(`${file} > `);
}
