import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { type CommandRunner, projectBin } from "./command.ts";
import { withReportDir } from "./git.ts";
import { failedTests, passedTests, type TestFailure, testFailures } from "./vitest-report.ts";
import { RUNNERS } from "./runners.ts";

export interface UnitRun {
  /** False when vitest wrote no report: nothing it says counts. */
  ran: boolean;
  passed: string[];
  failed: string[];
  /** Each failed test or test file with its message; present when vitest ran. */
  failures?: TestFailure[];
  output: string;
  /** The time limit, in seconds, vitest was stopped at (FR-RUN-09). */
  stoppedAfter?: number;
}

/**
 * Runs the given test files with the project's vitest, or the whole suite when there are none; with `coverage`, it
 * measures the coverage of the source paths into its dir. vitest's report goes in `reports`, which the caller removes,
 * or in a directory of this run's own, removed once read.
 */
export async function runUnitTests(dir: string, files: string[], run: CommandRunner, coverage?: { dir: string; source: string[] }, reports?: string): Promise<UnitRun> {
  if (reports === undefined) return withReportDir(dir, (own) => runUnitTests(dir, files, run, coverage, own));
  const report = join(reports, "oid-unit-tests.json");
  // With a coverage dir, vitest's provider writes the source's coverage there as istanbul JSON (FR-GATE-02).
  const measured =
    coverage === undefined
      ? []
      : [
          "--coverage.enabled",
          "--coverage.provider=v8",
          "--coverage.reporter=json",
          `--coverage.reportsDirectory=${coverage.dir}`,
          ...coverage.source.map((path) => `--coverage.include=${path}**`),
        ];
  const { output, stoppedAfter } = await run(projectBin(dir, RUNNERS.unit.bin), ["run", ...files, "--reporter=json", `--outputFile=${report}`, ...measured], { cwd: dir });
  // vitest writes its report at its end: one stopped at the time limit wrote none (FR-RUN-09).
  if (stoppedAfter !== undefined) return { ran: false, passed: [], failed: [], output, stoppedAfter };
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
