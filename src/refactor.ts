import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { addedLines } from "./coverage.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { detectFindings, type Finding, type FindingPlace, findingText, nearCopies, sameFinding, type SeenFinding, sourceMeasures, worseMeasures } from "./findings.ts";
import { calledFunctions, functionSignatures } from "./source-functions.ts";
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

/** A finding an item was given, with the source and its tree when the item started. */
interface ItemFinding extends SeenFinding {
  tree: string;
}

/**
 * Runs the detectors on the FR's diff since `since` and a cleanup item per finding; never stops the FR. Before each
 * item they run again on the source as the accepted items left it, so that the item gets its finding with its lines
 * now, and a finding an earlier item removed gets no item (FR-REF-02).
 */
export async function refactorPass(run: FrRun, scenario: Scenario, since: string, scope: string[]): Promise<void> {
  const handled: ItemFinding[] = [];
  for (let next = await nextFinding(run, since, handled); next !== undefined; next = await nextFinding(run, since, handled)) {
    handled.push(next);
    const { finding } = next;
    const accepted = await acceptedWork(run.worktree.dir);
    // A cleanup's note reaches the person whatever its verdict, and changes nothing (FR-REF-02).
    let note: string | undefined;
    const refusal = await withRetries(run.retries, async (previous) => {
      const tried = await cleanupOnce(run, scenario, finding, previous, since, scope);
      note = tried.note ?? note;
      return tried;
    });
    // When the item's retries run out, it goes back to the last checkpoint and the FR goes on (FR-REF-02).
    if (refusal !== undefined) await accepted.restore();
    await run.record({
      event: "cleanup",
      fr: run.fr,
      finding,
      verdict: refusal === undefined ? "accepted" : "not accepted",
      ...(refusal === undefined ? {} : { failed: refusal.failed }),
      ...(note === undefined ? {} : { note }),
    });
  }
  await recordNearCopies(run, since);
}

/** The first finding on the source now that is none an item was given, with the source and its tree. */
async function nextFinding(run: FrRun, since: string, handled: ItemFinding[]): Promise<ItemFinding | undefined> {
  const files = await sourceNow(run);
  const tree = await git(run.worktree.dir, "write-tree");
  const written = await Promise.all(handled.map((one) => writtenBetween(run, one.tree, tree)));
  const findings = await findingsOnDiff(run, since, files);
  const finding = findings.find((one) => !handled.some((item, at) => sameFinding(item, { finding: one, files }, written[at])));
  return finding === undefined ? undefined : { finding, files, tree };
}

/** The source lines that differ in `to` from `from`, by file: what a cleanup wrote. */
async function writtenBetween(run: FrRun, from: string, to: string): Promise<Map<string, Set<number>>> {
  return addedLines(await git(run.worktree.dir, "diff", "-U0", "--no-color", from, to, "--", ...run.layout.writable.code));
}

/** The near-copies of the functions the FR or its cleanup added, for the person: no cleanup touches them (FR-REF-01). */
async function recordNearCopies(run: FrRun, since: string): Promise<void> {
  const { dir } = run.worktree;
  const source = run.layout.writable.code;
  const files = await sourceNow(run);
  const added = addedLines(await git(dir, "diff", "-U0", "--no-color", since, "--", ...source));
  for (const near of nearCopies({ files, baseline: await sourceAt(dir, since, source), added })) {
    const at = ({ file, range }: FindingPlace, name: string) => `${file}:${range.start}-${range.end} (${name})`;
    await run.record({ event: "near-copy", fr: run.fr, place: at(near.place, near.name), resembles: at(near.resembles, near.resemblesName), lines: near.lines });
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

/** What the item is judged against: the source, its tree, its findings, its API and its measures before the attempt. */
interface BeforeItem {
  files: Map<string, string>;
  tree: string;
  findings: Finding[];
  exports: ModuleExports;
}

/** One cleanup attempt for one finding, checkpointed when accepted, as any attempt is (FR-REF-02). */
async function cleanupOnce(run: FrRun, scenario: Scenario, finding: Finding, previous: Refusal | undefined, since: string, scope: string[]) {
  const files = await sourceNow(run);
  const start = await git(run.worktree.dir, "write-tree");
  const before: BeforeItem = {
    files,
    tree: start,
    findings: await findingsOnDiff(run, since, files),
    exports: await exportSignatures(run.worktree.dir, [...files.keys()]),
  };
  const context = {
    ...run.texts,
    steps: [],
    finding: findingText(finding, files),
    functions: functionSignatures(files),
    calls: calledFunctions(files, [finding, ...(finding.related ?? [])]),
  };
  const judge = () => judgeCleanup(run, finding, before, since, scope);
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
  const written = await writtenBetween(run, before.tree, await git(run.worktree.dir, "write-tree"));
  const isBefore = (earlier: Finding, later: Finding) => sameFinding({ finding: earlier, files: before.files }, { finding: later, files: after }, written);
  const still = findings.find((one) => isBefore(finding, one));
  if (still !== undefined) {
    return { failed: "The cleanup's finding is still there", evidence: findingText(still, after), next: CLEAN_WITHOUT_CHANGING };
  }
  const added = findings.filter((one) => !before.findings.some((earlier) => isBefore(earlier, one)));
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
