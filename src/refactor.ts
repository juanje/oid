import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { addedLines } from "./coverage.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { detectFindings, type Finding, findingSignature, findingText, sourceMeasures, worseMeasures } from "./findings.ts";
import { type CheckResult, runGate } from "./gate.ts";
import { git } from "./git.ts";
import { changedExports, exportSignatures, type ModuleExports } from "./module-exports.ts";
import type { Refusal } from "./refusal.ts";
import { withRetries } from "./retries.ts";
import { checkpointedAttempt, type FrRun } from "./run-attempts.ts";
import { acceptedWork } from "./worktree.ts";

// The FR-scale refactor (D-07): once the FR's gate passes and before its commit, the two
// detectors run on the FR's diff against the whole source, and each finding gets a cleanup agent,
// one per attempt, whose item is accepted only when nothing behaviour-shaped moved (FR-REF-01, FR-REF-02).

/** Runs the detectors on the FR's diff since `since` and a cleanup item per finding; never stops the FR. */
export async function refactorPass(run: FrRun, scenario: Scenario, since: string, scope: string[]): Promise<void> {
  const findings = await findingsOnDiff(run, since, await sourceNow(run));
  for (const finding of findings) {
    const accepted = await acceptedWork(run.worktree.dir);
    const refusal = await withRetries(run.retries, (previous) => cleanupOnce(run, scenario, finding, previous, since, scope));
    // When the item's retries run out, it goes back to the last checkpoint and the FR goes on (FR-REF-02).
    if (refusal !== undefined) await accepted.restore();
    await run.record({ event: "cleanup", fr: run.fr, finding, verdict: refusal === undefined ? "accepted" : "not accepted", ...(refusal === undefined ? {} : { failed: refusal.failed }) });
  }
}

/** The findings of both detectors on the FR's diff against the whole source (FR-REF-01). */
async function findingsOnDiff(run: FrRun, since: string, files: Map<string, string>): Promise<Finding[]> {
  const { dir } = run.worktree;
  const source = run.layout.writable.code;
  const added = addedLines(await git(dir, "diff", "-U0", "--no-color", since, "--", ...source));
  return detectFindings({ files, baseline: await sourceAt(dir, since, source), added, limit: run.complexity });
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

/** What the item is judged against: the source, its findings, its API and its measures before the attempt. */
interface BeforeItem {
  files: Map<string, string>;
  signatures: Set<string>;
  exports: ModuleExports;
}

/** One cleanup attempt for one finding, checkpointed when accepted, as any attempt is (FR-REF-02). */
async function cleanupOnce(run: FrRun, scenario: Scenario, finding: Finding, previous: Refusal | undefined, since: string, scope: string[]) {
  const files = await sourceNow(run);
  const before: BeforeItem = {
    files,
    signatures: new Set((await findingsOnDiff(run, since, files)).map((one) => findingSignature(one, files))),
    exports: await exportSignatures(run.worktree.dir, [...files.keys()]),
  };
  const context = { ...run.texts, steps: [], finding: findingText(finding, files) };
  const judge = () => judgeCleanup(run, finding, before, since, scope);
  const start = await git(run.worktree.dir, "write-tree");
  const tried = await checkpointedAttempt(run, "refactor-code", scenario, previous, judge, undefined, context);
  if (tried.refusal === undefined) return tried;
  // The retry is given what the refused attempt did, so that it can finish it rather than start again (FR-REF-02).
  const diff = await git(run.worktree.dir, "diff", "--no-color", start, await git(run.worktree.dir, "write-tree"));
  return diff === "" ? tried : { ...tried, refusal: { ...tried.refusal, diff } };
}

const CLEAN_WITHOUT_CHANGING = "Clean without changing behaviour: remove the finding and nothing else, keeping every test, scenario and export as it is";

/** An item is accepted only when its findings are gone, none is new, the API and the measures hold, and every check passes. */
async function judgeCleanup(run: FrRun, finding: Finding, before: BeforeItem, since: string, scope: string[]): Promise<Refusal | undefined> {
  const after = await sourceNow(run);
  const findings = await findingsOnDiff(run, since, after);
  const itemSignature = findingSignature(finding, before.files);
  const still = findings.find((one) => findingSignature(one, after) === itemSignature);
  if (still !== undefined) {
    return { failed: "The cleanup's finding is still there", evidence: findingText(still, after), next: CLEAN_WITHOUT_CHANGING };
  }
  const added = findings.filter((one) => !before.signatures.has(findingSignature(one, after)));
  if (added.length > 0) {
    return { failed: "The cleanup added a new finding", evidence: added.map((one) => findingText(one, after)).join("\n"), next: CLEAN_WITHOUT_CHANGING };
  }
  const api = changedExports(before.exports, await exportSignatures(run.worktree.dir, [...after.keys()]));
  if (api.length > 0) {
    return { failed: "The cleanup changed the public API", evidence: api.join("\n"), next: "Keep every module exporting the same names with the same signatures; a rename that tests or steps import is not a cleanup's to make" };
  }
  const worse = worseMeasures(sourceMeasures(before.files), sourceMeasures(after));
  if (worse.length > 0) {
    return { failed: "The cleanup made a measure worse", evidence: worse.join("\n"), next: CLEAN_WITHOUT_CHANGING };
  }
  const checks = await runGate(run.worktree.dir, run.check("attempt"), { start: since, scenarios: scope, source: run.layout.writable.code, vitest: run.vitest });
  return checksRefusal(checks);
}

/** The refusal of a cleanup that left a check failing: every test and scenario must pass, the coverage check included. */
function checksRefusal(checks: CheckResult[]): Refusal | undefined {
  const failed = checks.filter((check) => !check.passed);
  if (failed.length === 0) return undefined;
  return {
    failed: `The cleanup left checks failing: ${failed.map((check) => check.name).join(", ")}`,
    evidence: failed.map((check) => `${check.name}:\n${check.failures?.join("\n") ?? check.error ?? check.output}`).join("\n"),
    next: CLEAN_WITHOUT_CHANGING,
  };
}
