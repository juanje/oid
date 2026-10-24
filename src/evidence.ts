import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { runCommand } from "./command.ts";
import { git } from "./git.ts";
import type { Refusal } from "./refusal.ts";
import { passedTests } from "./vitest-report.ts";

/** Refuses a test attempt whose new tests pass on the code they were written against: such a test proves nothing (D-02). */
export async function judgeNewTests(worktreeDir: string, testFiles: string[]): Promise<Refusal | undefined> {
  const passing = await testsThatPass(worktreeDir, testFiles);
  if (passing.length === 0) return undefined;
  return {
    failed: "New tests pass before their code exists",
    evidence: passing.join("\n"),
    next: "Make each of these tests assert behaviour the code does not have yet",
  };
}

async function testsThatPass(worktreeDir: string, testFiles: string[]): Promise<string[]> {
  // The report goes to the worktree's own git directory, out of the project's files.
  const report = join(await git(worktreeDir, "rev-parse", "--absolute-git-dir"), "oid-new-tests.json");
  const vitest = join(worktreeDir, "node_modules/.bin/vitest");
  await runCommand(vitest, ["run", ...testFiles, "--reporter=json", `--outputFile=${report}`], { cwd: worktreeDir });
  // vitest reports real paths, and the worktree may sit behind a symlink such as macOS's /var.
  return passedTests(JSON.parse(await readFile(report, "utf8")), await realpath(worktreeDir));
}
