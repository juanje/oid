import type { Layout } from "./boundaries.ts";
import type { VitestDialect } from "./vitest-dialect.ts";
import { join } from "node:path";
import { runAttempt } from "./attempt.ts";
import { runCommand } from "./command.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { isTestFile } from "./boundaries.ts";
import { judgeCode, judgeNewTests, noTestSuiteFiles } from "./evidence.ts";
import { importedSymbolsOf } from "./imported-symbols.ts";
import { testsUnderMutant } from "./mutant.ts";
import type { Attempt, AttemptKind, AttemptOutcome, Executor, Mutant, NextAttempt, TaskContext } from "./executor.ts";
import type { Failing } from "./inner-loop.ts";
import type { Refusal } from "./refusal.ts";
import type { Tried } from "./retries.ts";
import type { AttemptEvent, LogEvent } from "./run-log.ts";
import { runScenarios, type ScenarioRun } from "./scenarios.ts";
import { type FrTexts, taskContext } from "./task-context.ts";
import { runUnitTests, testsIn, type UnitRun } from "./unit-tests.ts";
import type { TestFailure } from "./vitest-report.ts";
import { acceptedWork, checkpoint, type RunWorktree } from "./worktree.ts";

// One FR's run, as its scenarios share it, and the attempts it runs: each with the run's executor, judged by what
// holds for every kind, logged, and checkpointed when accepted.

/** What every scenario of one FR's run shares. */
export interface FrRun {
  executor: Executor;
  fr: string;
  worktree: RunWorktree;
  /** Where the project keeps each kind of file (FR-AGENT-04). */
  layout: Layout;
  /** The project's vitest, whose output oid reads as that version writes it (FR-EVID-01). */
  vitest: VitestDialect;
  out: (text: string) => void;
  /** The scenarios already built, which every code attempt must keep green. */
  green: Scenario[];
  /** The tests there are, so that a test attempt is judged on its new tests only. */
  known: Set<string>;
  /** How many unit tests the last run of the whole suite ran: an attempt asked for must not leave fewer (FR-RUN-04). */
  tests: number;
  /** How many times a refused attempt is retried. */
  retries: number;
  /** How many turns an attempt's agent may take. */
  turns: number;
  /** How many rounds of test and code attempts a scenario may take (FR-RUN-09). */
  rounds: number;
  /** The complexity above which a function the FR changed is a finding (FR-REF-01). */
  complexity: number;
  /** The last report of each attempt kind, for the person when the scenario reaches its limit of rounds. */
  reports: Map<AttemptKind, string>;
  /** Appends to the run log. */
  record: (event: LogEvent) => Promise<void>;
  /** The FR's text and the project's domain and conventions, for every task (FR-AGENT-03). */
  texts: FrTexts;
  /** Each scenario's steps, by `<uri>:<line>`. */
  steps: Map<string, string[]>;
  /** Each scenario's latest run, by `<uri>:<line>`: where it fails now. */
  latest: Map<string, ScenarioRun>;
  /** Where the attempts' transcripts go, beside the run's log, and how many attempts have run. */
  transcripts: string;
  attempts: number;
  /** The provisional tests already sent to their one repair in this run (FR-EVID-01). */
  repaired: Set<string>;
  /** The unit tests still failing when the last code attempt was refused for them; none when it was refused for another reason. */
  unsatisfied?: TestFailure[];
}

/** An attempt as the run log keeps it: its verdict, and what the executor reported of it. */
export function attemptEvent(attempt: {
  kind: AttemptKind;
  scenario: string;
  refusal: Refusal | undefined;
  retry: boolean;
  outcome: AttemptOutcome;
  verdict?: AttemptEvent["verdict"];
  reds?: string[];
  asked?: boolean;
  mutant?: Mutant;
}): AttemptEvent {
  const { kind, scenario, refusal, retry, reds = [] } = attempt;
  const { turns, model, tokens, cacheRead, cost, deniedToolCalls } = attempt.outcome;
  const verdict = attempt.verdict ?? (refusal === undefined ? "accepted" : "refused");
  const shown = { ...(attempt.asked === true ? { asked: true as const } : {}), ...(attempt.mutant === undefined ? {} : { mutant: attempt.mutant }), ...(refusal === undefined ? {} : { refusal }), ...(reds.length === 0 ? {} : { reds }) };
  return { event: "attempt", kind, scenario, verdict, retry, ...shown, turns, model, tokens, cacheRead, cost, deniedToolCalls };
}

/** How a scenario's run fails, or nothing when it passes. */
export function failingOf(result: ScenarioRun | undefined): Failing | undefined {
  if (result === undefined || result.status === "passed") return undefined;
  return { step: result.failure?.step ?? "?", message: result.failure?.message ?? result.status };
}

/** One attempt of `kind` for `scenario` in this run, with the run's executor, worktree and turn limit. */
export async function attemptFor(run: FrRun, kind: AttemptKind, scenario: Scenario, previous: Refusal | undefined, asked?: Attempt["asked"], given?: TaskContext) {
  const location = locationOf(scenario);
  const context = given ?? (await taskContext(run.worktree.dir, kind, run.texts, run.steps.get(location) ?? [], run.latest.get(location), { asked: asked !== undefined, layout: run.layout }));
  await run.record({ event: "attempting", kind, scenario: scenario.name, retry: previous !== undefined });
  run.attempts += 1;
  const transcript = join(run.transcripts, `${String(run.attempts).padStart(2, "0")}-${kind}.jsonl`);
  return runAttempt({ executor: run.executor, kind, fr: run.fr, scenario, worktreeDir: run.worktree.dir, layout: run.layout, refusal: previous, turns: run.turns, context, transcript, asked });
}

export function locationOf(scenario: Scenario): string {
  return `${scenario.uri}:${scenario.line}`;
}

/** One code attempt and its judgment: the whole unit suite, and the scenarios built so far. */
export function codeAttempt(run: FrRun, scenario: Scenario, previous: Refusal | undefined, asked?: Attempt["asked"]): Promise<Tried & { next?: NextAttempt }> {
  // Refused before its judgment, at its boundary or its turn limit, it leaves no test unsatisfied.
  run.unsatisfied = undefined;
  return checkpointedAttempt(run, "code", scenario, previous, () => judgeCodeAttempt(run), asked);
}

/** One attempt judged by what holds for every kind, then by `judge`; logged, and checkpointed when accepted. */
export async function checkpointedAttempt(
  run: FrRun,
  kind: AttemptKind,
  scenario: Scenario,
  previous: Refusal | undefined,
  judge: (attempt: { files: string[]; mutant?: Mutant }) => Promise<Refusal | undefined>,
  asked?: Attempt["asked"],
  given?: TaskContext,
): Promise<Tried & { next?: NextAttempt; report?: string }> {
  const accepted = await acceptedWork(run.worktree.dir);
  const attempt = await attemptFor(run, kind, scenario, previous, asked, given);
  if (attempt.report !== undefined) run.reports.set(kind, attempt.report);
  const refusal = attempt.refusal ?? (await judge({ files: attempt.files, ...(attempt.mutant === undefined ? {} : { mutant: attempt.mutant }) }));
  await run.record(attemptEvent({ kind, scenario: scenario.name, refusal, retry: previous !== undefined, outcome: attempt.outcome, asked: asked !== undefined }));
  if (refusal === undefined) await checkpoint(run.worktree, `${kind} attempt for "${scenario.name}"`);
  return { refusal, rollback: accepted.restore, ...(attempt.next === undefined ? {} : { next: attempt.next }), ...(attempt.report === undefined ? {} : { report: attempt.report }) };
}

/**
 * A test attempt's judgment for branches no test runs (FR-GATE-02): its new tests take a branch the code has, so they
 * pass, and each must fail on the mutant of the branch it submits. One that adds no test is accepted: its report says
 * why no requirement asks for the branch.
 */
export async function judgeCoverTests(run: FrRun, { files, mutant }: { files: string[]; mutant?: Mutant }): Promise<Refusal | undefined> {
  const { worktree, layout } = run;
  const testFiles = files.filter((file) => isTestFile(file, layout));
  if (testFiles.length === 0) return undefined;
  const underMutant = mutant === undefined ? undefined : (passing: string[]) => testsUnderMutant(worktree, layout.writable.code, testFiles, mutant, passing);
  const judgment = await judgeNewTests(worktree.dir, testFiles, runCommand, await importedSymbolsOf(worktree.dir, testFiles), run.known, {
    offerMutant: true,
    ...(underMutant === undefined ? {} : { underMutant }),
  });
  return judgment.refusal;
}

/** A code attempt's judgment: the whole unit suite, and the scenarios built so far. */
export async function judgeCodeAttempt(run: FrRun): Promise<Refusal | undefined> {
  const { worktree, green, known } = run;
  const greenRuns = green.length === 0 ? [] : await runScenarios(worktree.dir, green, runCommand);
  const unit = await runUnitTests(worktree.dir, [], runCommand);
  for (const test of testsIn(unit)) known.add(test);
  if (unit.ran) run.tests = testCount(unit);
  // A file with no vitest test goes back to a test attempt, whose tests in it are new.
  for (const file of noTestSuiteFiles(unit)) known.delete(file);
  const refusal = judgeCode(unit, greenRuns);
  // Refused for its failing unit tests, and not for a test file the code cannot fix, which goes back to a test attempt.
  if (refusal !== undefined && refusal.sendTo === undefined && unit.ran && unit.failed.length > 0) run.unsatisfied = unit.failures ?? [];
  return refusal;
}

/** How many unit tests a run of the suite ran, passing or failing. */
export function testCount(unit: UnitRun): number {
  return unit.passed.length + (unit.failures ?? []).length;
}
