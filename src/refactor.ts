import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { addedLines } from "./coverage.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { detectFindings, type Finding, findingText } from "./findings.ts";
import { git } from "./git.ts";
import { withRetries } from "./retries.ts";
import { checkpointedAttempt, type FrRun } from "./run-attempts.ts";
import { acceptedWork } from "./worktree.ts";

// The FR-scale refactor (D-07): once every scenario of the FR is green and before its gate, the two
// detectors run on the FR's diff against the whole source, and each finding gets a cleanup agent,
// one per attempt (FR-REF-01, FR-REF-02). With no finding, no agent runs.

/** Runs the detectors on the FR's diff since `since` and a cleanup attempt per finding; never stops the FR. */
export async function refactorPass(run: FrRun, scenario: Scenario, since: string): Promise<void> {
  const findings = await findingsOnDiff(run, since);
  for (const finding of findings) {
    const accepted = await acceptedWork(run.worktree.dir);
    const refusal = await withRetries(run.retries, (previous) => cleanupOnce(run, scenario, finding, previous));
    // When the item's retries run out, it goes back to the last checkpoint and the FR goes on (FR-REF-02).
    if (refusal !== undefined) await accepted.restore();
  }
}

/** The findings of both detectors on the FR's diff against the whole source (FR-REF-01). */
async function findingsOnDiff(run: FrRun, since: string): Promise<Finding[]> {
  const { dir } = run.worktree;
  const source = run.layout.writable.code;
  const added = addedLines(await git(dir, "diff", "-U0", "--no-color", since, "--", ...source));
  return detectFindings({ files: await sourceNow(run), baseline: await sourceAt(dir, since, source), added, limit: run.complexity });
}

/** The source files as the FR left them, read from the worktree. */
async function sourceNow(run: FrRun): Promise<Map<string, string>> {
  const { dir } = run.worktree;
  const listed = await git(dir, "ls-files", "--", ...run.layout.writable.code);
  const files = new Map<string, string>();
  for (const file of listed.split("\n").filter((name) => name !== "")) files.set(file, await readFile(join(dir, file), "utf8"));
  return files;
}

/** The same files at the run's start. */
async function sourceAt(dir: string, since: string, source: string[]): Promise<Map<string, string>> {
  const listed = await git(dir, "ls-tree", "-r", "--name-only", since, "--", ...source);
  const files = new Map<string, string>();
  for (const file of listed.split("\n").filter((name) => name !== "")) files.set(file, await git(dir, "show", `${since}:${file}`));
  return files;
}

/** One cleanup attempt for one finding, checkpointed when accepted, as any attempt is (judged by FR-REF-02). */
async function cleanupOnce(run: FrRun, scenario: Scenario, finding: Finding, previous: Parameters<typeof checkpointedAttempt>[3]) {
  const context = { ...run.texts, steps: [], finding: findingText(finding, await sourceNow(run)) };
  return checkpointedAttempt(run, "refactor-code", scenario, previous, async () => undefined, undefined, context);
}
