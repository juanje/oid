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
import { listScenarios, runScenarios, type ScenarioRun } from "./scenarios.ts";
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
}

/** Builds one FR in its own worktree and commits it on the run's branch; returns the exit code. */
export async function runFr(options: RunOptions): Promise<number> {
  const worktree = await createRunWorktree(options.projectDir, runId(options.fr));
  const log = await startRunLog(worktree.dir, worktree.id);
  const record = log.record;
  let exitCode: number | undefined;
  try {
    exitCode = await buildFr(options, worktree, record);
    return exitCode;
  } catch (error) {
    // A limit ends the run at the work accepted so far, and says which limit (FR-RUN-09).
    if (!(error instanceof LimitReached)) throw error;
    await record(attemptEvent(error.kind, error.scenario, undefined, false, error.outcome, "stopped at the turn limit"));
    await record({ event: "stop", limit: "turns" });
    options.out(`${error.message}\n`);
    exitCode = EXIT_LIMIT;
    return exitCode;
  } finally {
    // The worktree goes however the run ends; only a built FR gets its commit and drops its checkpoints.
    await finishRun(worktree, exitCode === EXIT_BUILT ? `feat(${options.fr}): built by oid run` : undefined);
    if (exitCode !== undefined) await log.end(exitCode);
  }
}

/** An attempt as the run log keeps it: its verdict, and what the executor reported of it. */
function attemptEvent(
  kind: AttemptKind,
  scenario: string,
  refusal: Refusal | undefined,
  retry: boolean,
  outcome: AttemptOutcome,
  verdict: AttemptEvent["verdict"] = refusal === undefined ? "accepted" : "refused",
): AttemptEvent {
  const { turns, model, tokens, cost, deniedToolCalls } = outcome;
  return { event: "attempt", kind, scenario, verdict, retry, ...(refusal === undefined ? {} : { refusal }), turns, model, tokens, cost, deniedToolCalls };
}

async function buildFr({ fr, executor, out }: RunOptions, worktree: RunWorktree, record: (event: LogEvent) => Promise<void>): Promise<number> {
  const known = testsIn(await runUnitTests(worktree.dir, [], runCommand));
  const { retries, turns } = await readLimits(worktree.dir);
  const run: FrRun = { executor, fr, worktree, out, green: [], known, retries, turns, record };
  const scenarios = await listScenarios(worktree.dir, fr, runCommand);
  if (scenarios.length === 0) {
    return stop(`cucumber-js finds no scenario for ${fr}: check the project's cucumber-js configuration and the tag @${fr} on its feature file.`, out);
  }
  const builtRefusal = await buildScenarios(run, scenarios);
  if (builtRefusal !== undefined) return refuse(builtRefusal, out);
  // A code attempt after the gate belongs to the FR's last scenario; its refusal's focus says what to fix.
  const last = scenarios[scenarios.length - 1]!;
  const gate = await gateLoop(retries, () => runGate(worktree.dir, runCommand), (refusal) => codeAttempt(run, last, refusal));
  if ("error" in gate) return stop(gate.error, out);
  if (gate.refusal !== undefined) return refuse(gate.refusal, out);
  out(`${fr} built on branch ${worktree.branch}\n`);
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
    run.green.push(scenario);
  }
  return undefined;
}

/** Builds one scenario: its step definitions, Red first, then rounds of test and code until it passes, keeping the green ones green. */
async function buildScenario(run: FrRun, scenario: Scenario): Promise<Refusal | undefined> {
  const { out, known, retries } = run;
  const worktreeDir = run.worktree.dir;
  // An attempt and the judgment of its kind, retried from the work accepted before it while refused (FR-RUN-07).
  const judged = (kind: AttemptKind, judge: (files: string[]) => Promise<Refusal | undefined>) =>
    withRetries(retries, async (previous) => {
      const accepted = await acceptedWork(worktreeDir);
      const attempt = await attemptFor(run, kind, scenario, previous);
      const refusal = attempt.refusal ?? (await judge(attempt.files));
      await run.record(attemptEvent(kind, scenario.name, refusal, previous !== undefined, attempt.outcome));
      if (refusal === undefined) await checkpoint(run.worktree, `${kind} attempt for "${scenario.name}"`);
      return { refusal, rollback: accepted.restore };
    });
  const runScenario = async (): Promise<ScenarioRun> => (await runScenarios(worktreeDir, [scenario], runCommand))[0]!;
  // Asked at each judgment, of the file that failed: the project changes with every attempt.
  const symbolsOf = (files: string[]) => importedSymbolsOf(worktreeDir, files);
  const accept = ({ refusal, reds }: Judgment): Refusal | undefined => {
    for (const red of reds) out(`Red: ${red}\n`);
    return refusal;
  };

  const stepsRefusal = await judged("steps", async () => {
    const result = await runScenario();
    const stepFile = result.failure?.definedIn;
    const exists = await symbolsOf(stepFile === undefined ? [] : [stepFile]);
    return accept(judgeSteps(result, (name) => exists(name, stepFile ?? "")));
  });
  if (stepsRefusal !== undefined) return stepsRefusal;
  return innerLoop(
    async () =>
      (await judged("test", async (files) => {
        const testFiles = files.filter(isTestFile);
        return accept(await judgeNewTests(worktreeDir, testFiles, runCommand, await symbolsOf(testFiles), known));
      })) ??
      (await withRetries(retries, (previous) => codeAttempt(run, scenario, previous))),
    async () => (await runScenario()).status === "passed",
  );
}

/** One attempt of `kind` for `scenario` in this run, with the run's executor, worktree and turn limit. */
function attemptFor(run: FrRun, kind: AttemptKind, scenario: Scenario, previous: Refusal | undefined) {
  return runAttempt({ executor: run.executor, kind, fr: run.fr, scenario, worktreeDir: run.worktree.dir, refusal: previous, turns: run.turns });
}

/** One code attempt and its judgment: the whole unit suite, and the scenarios built so far. */
async function codeAttempt(run: FrRun, scenario: Scenario, previous: Refusal | undefined): Promise<Tried> {
  const accepted = await acceptedWork(run.worktree.dir);
  const attempt = await attemptFor(run, "code", scenario, previous);
  const refusal = attempt.refusal ?? (await judgeCodeAttempt(run));
  await run.record(attemptEvent("code", scenario.name, refusal, previous !== undefined, attempt.outcome));
  if (refusal === undefined) await checkpoint(run.worktree, `code attempt for "${scenario.name}"`);
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
