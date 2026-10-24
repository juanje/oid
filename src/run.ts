import { join } from "node:path";
import { AgentError } from "./agent-error.ts";
import { runAttempt } from "./attempt.ts";
import { isTestFile } from "./boundaries.ts";
import { runCommand } from "./command.ts";
import { readLimits } from "./config.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { type Judgment, judgeCode, judgeNewTests, judgeSteps } from "./evidence.ts";
import type { AttemptKind, AttemptOutcome, Executor } from "./executor.ts";
import { EXIT_BUILT, EXIT_ERROR, EXIT_LIMIT, EXIT_REFUSED } from "./exit.ts";
import { LimitReached } from "./limits.ts";
import { runGate } from "./gate.ts";
import { gateLoop } from "./gate-loop.ts";
import { innerLoop } from "./inner-loop.ts";
import { importedSymbolsOf } from "./imported-symbols.ts";
import { formatRefusal, type Refusal } from "./refusal.ts";
import { type Tried, withRetries } from "./retries.ts";
import { type AttemptEvent, type LogEvent, startRunLog } from "./run-log.ts";
import { summarize, transcriptsOf } from "./summary.ts";
import { type FrTexts, frTexts, taskContext } from "./task-context.ts";
import { frScenarios, runScenarios, type ScenarioRun } from "./scenarios.ts";
import { runUnitTests, testsIn } from "./unit-tests.ts";
import { acceptedWork, checkpoint, createRunWorktree, finishRun, type RunWorktree } from "./worktree.ts";

export interface RunOptions {
  projectDir: string;
  fr: string;
  executor: Executor;
  out: (text: string) => void;
}


/** What every scenario of one FR's run shares. */
interface FrRun {
  executor: Executor;
  fr: string;
  worktree: RunWorktree;
  out: (text: string) => void;
  /** The scenarios already built, which every code attempt must keep green. */
  green: Scenario[];
  /** The tests there are, so that a test attempt is judged on its new tests only. */
  known: Set<string>;
  /** How many times a refused attempt is retried. */
  retries: number;
  /** How many turns an attempt's agent may take. */
  turns: number;
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
}

/** Builds one FR in its own worktree and commits it on the run's branch; returns the exit code. */
export async function runFr(options: RunOptions): Promise<number> {
  const worktree = await createRunWorktree(options.projectDir, runId(options.fr));
  const log = await startRunLog(worktree.dir, worktree.id);
  const record = log.record;
  let exitCode: number | undefined;
  try {
    exitCode = await buildFr(options, worktree, record, transcriptsOf(log.path));
    return exitCode;
  } catch (error) {
    // An agent's error ends the run at the work accepted so far, as an error no attempt can fix; its use still counts.
    if (error instanceof AgentError) {
      await record(attemptEvent({ kind: error.kind, scenario: error.scenario, refusal: undefined, retry: false, outcome: error.outcome, verdict: "stopped on an error" }));
      exitCode = stop(error.message, options.out);
      return exitCode;
    }
    // A limit ends the run at the work accepted so far, and says which limit (FR-RUN-09).
    if (!(error instanceof LimitReached)) throw error;
    await record(
      attemptEvent({ kind: error.kind, scenario: error.scenario, refusal: undefined, retry: false, outcome: error.outcome, verdict: "stopped at the turn limit" }),
    );
    await record({ event: "stop", limit: "turns" });
    options.out(`${error.message}\n`);
    exitCode = EXIT_LIMIT;
    return exitCode;
  } finally {
    // The worktree goes however the run ends; only a built FR gets its commit and drops its checkpoints.
    await finishRun(worktree, exitCode === EXIT_BUILT ? `feat(${options.fr}): built by oid run` : undefined);
    if (exitCode !== undefined) {
      await log.end(exitCode);
      options.out(summarize(log.events, log.path));
    }
  }
}

/** An attempt as the run log keeps it: its verdict, and what the executor reported of it. */
function attemptEvent(attempt: {
  kind: AttemptKind;
  scenario: string;
  refusal: Refusal | undefined;
  retry: boolean;
  outcome: AttemptOutcome;
  verdict?: AttemptEvent["verdict"];
  reds?: string[];
}): AttemptEvent {
  const { kind, scenario, refusal, retry, reds = [] } = attempt;
  const { turns, model, tokens, cost, deniedToolCalls } = attempt.outcome;
  const verdict = attempt.verdict ?? (refusal === undefined ? "accepted" : "refused");
  const shown = { ...(refusal === undefined ? {} : { refusal }), ...(reds.length === 0 ? {} : { reds }) };
  return { event: "attempt", kind, scenario, verdict, retry, ...shown, turns, model, tokens, cost, deniedToolCalls };
}

async function buildFr({ fr, executor, out }: RunOptions, worktree: RunWorktree, record: (event: LogEvent) => Promise<void>, transcripts: string): Promise<number> {
  const known = testsIn(await runUnitTests(worktree.dir, [], runCommand));
  const { retries, turns } = await readLimits(worktree.dir);
  const { scenarios, steps } = await frScenarios(worktree.dir, fr, runCommand);
  const run: FrRun = { executor, fr, worktree, out, green: [], known, retries, turns, record, texts: await frTexts(worktree.dir, fr), steps, latest: new Map(), transcripts, attempts: 0 };
  await record({ event: "start", fr, scenarios, branch: worktree.branch, checkpoints: worktree.checkpoints });
  if (scenarios.length === 0) {
    return stop(`cucumber-js finds no scenario for ${fr}: check the project's cucumber-js configuration and the tag @${fr} on its feature file.`, out);
  }
  const builtRefusal = await buildScenarios(run, scenarios);
  if (builtRefusal !== undefined) return refuse(builtRefusal, out);
  // An attempt after the gate belongs to the FR's last scenario; its refusal's evidence and focus say what to fix.
  const last = scenarios[scenarios.length - 1]!;
  const gate = await gateLoop(retries, () => runGate(worktree.dir, runCommand), (kind, refusal) => attemptAfterGate(run, kind, last, refusal));
  if ("error" in gate) return stop(gate.error, out);
  if (gate.refusal !== undefined) return refuse(gate.refusal, out);
  return EXIT_BUILT;
}

/** Stops the run on an error no attempt can fix. */
function stop(error: string, out: (text: string) => void): number {
  out(`${error}\n`);
  return EXIT_ERROR;
}

function refuse(refusal: Refusal, out: (text: string) => void): number {
  out(formatRefusal(refusal));
  return EXIT_REFUSED;
}

/** Builds the FR's scenarios one at a time, in file order, and returns the first refusal, if any. */
async function buildScenarios(run: FrRun, scenarios: Scenario[]): Promise<Refusal | undefined> {
  for (const scenario of scenarios) {
    const refusal = await buildScenario(run, scenario);
    if (refusal !== undefined) return refusal;
    await run.record({ event: "scenario", ...scenario, verdict: "built" });
    run.green.push(scenario);
  }
  return undefined;
}

/** Builds one scenario: its step definitions, Red first, then rounds of test and code until it passes, keeping the green ones green. */
async function buildScenario(run: FrRun, scenario: Scenario): Promise<Refusal | undefined> {
  const { out, known, retries } = run;
  const worktreeDir = run.worktree.dir;
  // One attempt and the judgment of its kind, from the work accepted before it.
  const once =
    (kind: AttemptKind, judge: (files: string[]) => Promise<Judgment>) =>
    async (previous: Refusal | undefined): Promise<Tried> => {
      const accepted = await acceptedWork(worktreeDir);
      const attempt = await attemptFor(run, kind, scenario, previous);
      const judgment = attempt.refusal === undefined ? await judge(attempt.files) : { refusal: attempt.refusal, reds: [] };
      const refusal = judgment.refusal;
      await run.record(attemptEvent({ kind, scenario: scenario.name, refusal, retry: previous !== undefined, outcome: attempt.outcome, reds: judgment.reds }));
      if (refusal === undefined) await checkpoint(run.worktree, `${kind} attempt for "${scenario.name}"`);
      return { refusal, rollback: accepted.restore };
    };
  // Retried while refused, up to the run's retries (FR-RUN-07).
  const judged = (kind: AttemptKind, judge: (files: string[]) => Promise<Judgment>) => withRetries(retries, once(kind, judge));
  const runScenario = async (): Promise<ScenarioRun> => {
    const result = (await runScenarios(worktreeDir, [scenario], runCommand))[0]!;
    run.latest.set(locationOf(scenario), result);
    return result;
  };
  // Asked at each judgment, of the file that failed: the project changes with every attempt.
  const symbolsOf = (files: string[]) => importedSymbolsOf(worktreeDir, files);
  const accept = (judgment: Judgment): Judgment => {
    for (const red of judgment.reds) out(`Red: ${red}\n`);
    return judgment;
  };

  const stepsRefusal = await judged("steps", async () => {
    const result = await runScenario();
    const stepFile = result.failure?.definedIn;
    const exists = await symbolsOf(stepFile === undefined ? [] : [stepFile]);
    return accept(judgeSteps(result, (name) => exists(name, stepFile ?? "")));
  });
  if (stepsRefusal !== undefined) return stepsRefusal;
  const testOnce = once("test", async (files) => {
    const testFiles = files.filter(isTestFile);
    return accept(await judgeNewTests(worktreeDir, testFiles, runCommand, await symbolsOf(testFiles), known));
  });
  // A code attempt's retry; a refusal the code cannot act on goes back to a test attempt first, and the pair counts as
  // one retry (FR-RUN-03). A refused test attempt there sends the next retry to a test attempt again.
  const codeRetry = async (previous: Refusal | undefined): Promise<Tried> => {
    if (previous?.sendTo !== "test") return codeAttempt(run, scenario, previous);
    const test = await testOnce(previous);
    if (test.refusal !== undefined) return { ...test, refusal: { ...test.refusal, sendTo: "test" } };
    return codeAttempt(run, scenario, undefined);
  };
  return innerLoop(
    async () => (await withRetries(retries, testOnce)) ?? (await withRetries(retries, codeRetry)),
    async () => (await runScenario()).status === "passed",
  );
}

/** One attempt of `kind` for `scenario` in this run, with the run's executor, worktree and turn limit. */
async function attemptFor(run: FrRun, kind: AttemptKind, scenario: Scenario, previous: Refusal | undefined) {
  const location = locationOf(scenario);
  const context = await taskContext(run.worktree.dir, kind, run.texts, run.steps.get(location) ?? [], run.latest.get(location));
  run.attempts += 1;
  const transcript = join(run.transcripts, `${String(run.attempts).padStart(2, "0")}-${kind}.jsonl`);
  return runAttempt({ executor: run.executor, kind, fr: run.fr, scenario, worktreeDir: run.worktree.dir, refusal: previous, turns: run.turns, context, transcript });
}

function locationOf(scenario: Scenario): string {
  return `${scenario.uri}:${scenario.line}`;
}

/** One code attempt and its judgment: the whole unit suite, and the scenarios built so far. */
function codeAttempt(run: FrRun, scenario: Scenario, previous: Refusal | undefined): Promise<Tried> {
  return checkpointedAttempt(run, "code", scenario, previous, () => judgeCodeAttempt(run));
}

/**
 * An attempt the gate sent back. A code attempt is judged as any code attempt. A test or steps attempt is judged by
 * its boundary and its report only, with no new Red: its tests have theirs, and the gate runs again after it.
 */
function attemptAfterGate(run: FrRun, kind: AttemptKind, scenario: Scenario, refusal: Refusal): Promise<Tried> {
  if (kind === "code") return codeAttempt(run, scenario, refusal);
  return checkpointedAttempt(run, kind, scenario, refusal, async () => undefined);
}

/** One attempt judged by what holds for every kind, then by `judge`; logged, and checkpointed when accepted. */
async function checkpointedAttempt(
  run: FrRun,
  kind: AttemptKind,
  scenario: Scenario,
  previous: Refusal | undefined,
  judge: () => Promise<Refusal | undefined>,
): Promise<Tried> {
  const accepted = await acceptedWork(run.worktree.dir);
  const attempt = await attemptFor(run, kind, scenario, previous);
  const refusal = attempt.refusal ?? (await judge());
  await run.record(attemptEvent({ kind, scenario: scenario.name, refusal, retry: previous !== undefined, outcome: attempt.outcome }));
  if (refusal === undefined) await checkpoint(run.worktree, `${kind} attempt for "${scenario.name}"`);
  return { refusal, rollback: accepted.restore };
}

/** A code attempt's judgment: the whole unit suite, and the scenarios built so far. */
async function judgeCodeAttempt({ worktree, green, known }: FrRun): Promise<Refusal | undefined> {
  const greenRuns = green.length === 0 ? [] : await runScenarios(worktree.dir, green, runCommand);
  const unit = await runUnitTests(worktree.dir, [], runCommand);
  for (const test of testsIn(unit)) known.add(test);
  return judgeCode(unit, greenRuns);
}

function runId(fr: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `${fr}-${stamp}`;
}
