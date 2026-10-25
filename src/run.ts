import { join } from "node:path";
import { AgentError } from "./agent-error.ts";
import { runAttempt } from "./attempt.ts";
import { isTestFile } from "./boundaries.ts";
import { runCommand } from "./command.ts";
import { ConfigError, readLimits, uncommittedProjectConfig } from "./config.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { type Judgment, judgeCode, judgeNewTests, judgeSteps, noTestSuiteFiles, provisionalOf } from "./evidence.ts";
import type { AttemptKind, AttemptOutcome, Executor } from "./executor.ts";
import { EXIT_BUILT, EXIT_ERROR, EXIT_LIMIT, EXIT_REFUSED } from "./exit.ts";
import { LimitReached, RoundLimitReached } from "./limits.ts";
import { missingCoverageProvider } from "./coverage.ts";
import { runGate } from "./gate.ts";
import { gateLoop } from "./gate-loop.ts";
import { type Failing, innerLoop, type RoundResult, withoutStack } from "./inner-loop.ts";
import { importedSymbolsOf } from "./imported-symbols.ts";
import { type Pending, refutedRefusal, whenCodeRunsOut } from "./provisional.ts";
import { formatRefusal, type Refusal } from "./refusal.ts";
import { roundLimitMessage, stalledRefusal } from "./rounds.ts";
import { type Tried, withRetries } from "./retries.ts";
import { type AttemptEvent, type LogEvent, startRunLog } from "./run-log.ts";
import { progressLine } from "./progress.ts";
import { summarize, transcriptsOf } from "./summary.ts";
import { oidVersion } from "./version.ts";
import { type FrTexts, frTexts, taskContext } from "./task-context.ts";
import { frScenarios, runScenarios, type ScenarioRun } from "./scenarios.ts";
import { runUnitTests, testsIn } from "./unit-tests.ts";
import type { TestFailure } from "./vitest-report.ts";
import { acceptedWork, checkpoint, createRunWorktree, finishRun, freeRunId, type RunWorktree } from "./worktree.ts";

export interface RunOptions {
  projectDir: string;
  fr: string;
  /** The executor, or how to make it once the run starts: the real one reads the person's config. */
  executor: Executor | (() => Promise<Executor>);
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
  /** How many rounds of test and code attempts a scenario may take (FR-RUN-09). */
  rounds: number;
  /** The last report of each attempt kind, for the person when the rounds stop moving or reach their limit. */
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

/** Builds one FR in its own worktree and commits it on the run's branch; returns the exit code. */
export async function runFr(options: RunOptions): Promise<number> {
  // A silently ignored edit would be a check that does not tell the truth (NFR-02, NFR-08).
  if (await uncommittedProjectConfig(options.projectDir)) {
    options.out(".oid.json has changes that are not committed: this run reads the project's config from HEAD and does not use them; commit them for them to count.\n");
  }
  // The log starts before the worktree, so that every stage, the first included, is in it and shown (FR-CLI-05).
  const id = await freeRunId(options.projectDir, runId(options.fr));
  const log = await startRunLog(options.projectDir, id, (event) => {
    const line = progressLine(event);
    if (line !== undefined) options.out(`${line}\n`);
  });
  const record = log.record;
  let exitCode: number | undefined;
  let worktree: RunWorktree | undefined;
  try {
    // The agent first: a model oid cannot use stops the run before it creates anything (NFR-08).
    await record({ event: "stage", stage: "agent" });
    let executor: Executor;
    try {
      executor = typeof options.executor === "function" ? await options.executor() : options.executor;
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      exitCode = stop(error.message, options.out);
      return exitCode;
    }
    await record({ event: "stage", stage: "worktree" });
    worktree = await createRunWorktree(options.projectDir, id);
    exitCode = await buildFr({ ...options, executor }, worktree, record, transcriptsOf(log.path));
    return exitCode;
  } catch (error) {
    // An agent's error ends the run at the work accepted so far, as an error no attempt can fix; its use still counts.
    if (error instanceof AgentError) {
      await record(attemptEvent({ kind: error.kind, scenario: error.scenario, refusal: undefined, retry: false, outcome: error.outcome, verdict: "stopped on an error" }));
      exitCode = stop(error.message, options.out);
      return exitCode;
    }
    // A limit ends the run at the work accepted so far, and says which limit (FR-RUN-09).
    if (error instanceof RoundLimitReached) {
      await record({ event: "stop", limit: "rounds", scenario: error.scenario });
      options.out(`${error.message}\n`);
      exitCode = EXIT_LIMIT;
      return exitCode;
    }
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
    if (worktree !== undefined) {
      if (exitCode === EXIT_BUILT) await record({ event: "stage", stage: "commit" });
      await finishRun(worktree, exitCode === EXIT_BUILT ? `feat(${options.fr}): built by oid run` : undefined);
    }
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
  const { turns, model, tokens, cacheRead, cost, deniedToolCalls } = attempt.outcome;
  const verdict = attempt.verdict ?? (refusal === undefined ? "accepted" : "refused");
  const shown = { ...(refusal === undefined ? {} : { refusal }), ...(reds.length === 0 ? {} : { reds }) };
  return { event: "attempt", kind, scenario, verdict, retry, ...shown, turns, model, tokens, cacheRead, cost, deniedToolCalls };
}

async function buildFr(
  { fr, executor, out }: RunOptions & { executor: Executor },
  worktree: RunWorktree,
  record: (event: LogEvent) => Promise<void>,
  transcripts: string,
): Promise<number> {
  await record({ event: "stage", stage: "scenarios" });
  const { scenarios, steps } = await frScenarios(worktree.dir, fr, runCommand);
  await record({ event: "start", oid: oidVersion(), fr, scenarios, branch: worktree.branch, checkpoints: worktree.checkpoints });
  if (scenarios.length === 0) {
    return stop(`cucumber-js finds no scenario for ${fr}: check the project's cucumber-js configuration and the tag @${fr} on its feature file.`, out);
  }
  const noProvider = missingCoverageProvider(worktree.dir);
  if (noProvider !== undefined) return stop(noProvider, out);
  await record({ event: "stage", stage: "unit tests" });
  const known = testsIn(await runUnitTests(worktree.dir, [], runCommand));
  const { retries, turns, rounds } = await readLimits(worktree.dir);
  const run: FrRun = { executor, fr, worktree, out, green: [], known, retries, turns, rounds, reports: new Map(), record, texts: await frTexts(worktree.dir, fr), steps, latest: new Map(), transcripts, attempts: 0, repaired: new Set() };
  const builtRefusal = await buildScenarios(run, scenarios);
  if (builtRefusal !== undefined) return refuse(builtRefusal, out);
  // An attempt after the gate belongs to the FR's last scenario; its refusal's evidence and focus say what to fix.
  const last = scenarios[scenarios.length - 1]!;
  await record({ event: "stage", stage: "gate" });
  const gate = await gateLoop(
    retries,
    () => runGate(worktree.dir, runCommand, { start: worktree.start }),
    (kind, refusal) => attemptAfterGate(run, kind, last, refusal),
    (refusal, sendTo) =>
      record({ event: "gate", verdict: refusal === undefined ? "passed" : "refused", ...(refusal === undefined ? {} : { refusal }), ...(sendTo === undefined ? {} : { sendTo }) }),
  );
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
  const { known, retries } = run;
  const worktreeDir = run.worktree.dir;
  // One attempt and the judgment of its kind, from the work accepted before it.
  const once =
    (kind: AttemptKind, judge: (files: string[]) => Promise<Judgment>) =>
    async (previous: Refusal | undefined): Promise<Tried> => {
      const accepted = await acceptedWork(worktreeDir);
      const attempt = await attemptFor(run, kind, scenario, previous);
      if (attempt.report !== undefined) run.reports.set(kind, attempt.report);
      const judgment = attempt.refusal === undefined ? await judge(attempt.files) : { refusal: attempt.refusal, reds: [] };
      const refusal = judgment.refusal;
      // An accepted Red oid cannot classify waits for the code to confirm it.
      const provisional = refusal === undefined ? provisionalOf(judgment.reds) : [];
      if (kind === "steps" && provisional.length > 0) pending.scenario = provisional[0];
      if (kind === "test") pending.tests.push(...provisional);
      await run.record(attemptEvent({ kind, scenario: scenario.name, refusal, retry: previous !== undefined, outcome: attempt.outcome, reds: judgment.reds }));
      if (refusal === undefined) await checkpoint(run.worktree, `${kind} attempt for "${scenario.name}"`);
      return { refusal, rollback: accepted.restore };
    };
  const pending: Pending = { tests: [] };
  // The last code attempt, and the last accepted one, by transcript number: the attempts that settle provisional Reds.
  let lastCode = 0;
  let lastAccepted = 0;
  const settle = async (what: string[], verdict: "confirmed" | "refuted", attempt: number): Promise<void> => {
    for (const one of what) await run.record({ event: "red", what: one, verdict, attempt });
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

  const stepsRefusal = await judged("steps", async () => {
    const result = await runScenario();
    const stepFile = result.failure?.definedIn;
    const exists = await symbolsOf(stepFile === undefined ? [] : [stepFile]);
    return judgeSteps(result, (name) => exists(name, stepFile ?? ""));
  });
  if (stepsRefusal !== undefined) return stepsRefusal;
  // A test attempt's new tests, in the files it changed and in `also`: a repaired test's file, even if left as it was.
  const description = `${scenario.uri}:${scenario.line} "${scenario.name}"`;
  // A test attempt that adds no test is not accepted: its round makes no progress (FR-RUN-03).
  let addedNoTest = false;
  const judgeTests = (also: string[]) => async (files: string[]): Promise<Judgment> => {
    const testFiles = [...new Set([...files.filter(isTestFile), ...also])];
    const judgment = testFiles.length === 0 ? undefined : await judgeNewTests(worktreeDir, testFiles, runCommand, await symbolsOf(testFiles), known);
    if (judgment !== undefined && (judgment.refusal !== undefined || judgment.reds.length > 0)) return judgment;
    addedNoTest = true;
    const now = failingOf(run.latest.get(locationOf(scenario)));
    return { refusal: stalledRefusal(description, now ?? { step: "?", message: "" }), reds: [] };
  };
  const testOnce = once("test", judgeTests([]));
  // A code attempt's retry; a refusal the code cannot act on goes back to a test attempt first, and the pair counts as
  // one retry (FR-RUN-03). A refused test attempt there sends the next retry to a test attempt again.
  // An accepted code attempt makes every unit test pass: it confirms the provisional tests.
  let undoLastCode = async (): Promise<void> => {};
  const settledCode = async (previous: Refusal | undefined): Promise<Tried> => {
    const tried = await codeAttempt(run, scenario, previous);
    lastCode = run.attempts;
    undoLastCode = tried.rollback;
    if (tried.refusal === undefined) {
      lastAccepted = lastCode;
      await settle(pending.tests, "confirmed", lastCode);
      pending.tests = [];
    }
    return tried;
  };
  const codeRetry = async (previous: Refusal | undefined): Promise<Tried> => {
    if (previous?.sendTo !== "test") return settledCode(previous);
    const test = await testOnce(previous);
    if (test.refusal !== undefined) return { ...test, refusal: { ...test.refusal, sendTo: "test" } };
    return settledCode(undefined);
  };
  // The code attempts, and when they run out with a provisional Red still failing, its refutation: a provisional test
  // goes back to one test attempt, then to the code attempts again; a refuted scenario stops the run (FR-EVID-01).
  const codeRound = async (): Promise<Refusal | undefined> => {
    for (;;) {
      const refusal = await withRetries(retries, codeRetry);
      if (refusal === undefined) return undefined;
      const unsatisfied = run.unsatisfied;
      const settled = whenCodeRunsOut(pending, run.repaired, unsatisfied?.map((failure) => failure.test));
      if (settled === undefined) return refusal;
      const withFailure = (test: string): string => {
        const failure = unsatisfied?.find((one) => one.test === test);
        return failure === undefined ? test : `${test}: ${failure.message}`;
      };
      if ("refuted" in settled) {
        await settle(settled.refuted, "refuted", lastCode);
        if (settled.refuted[0] !== pending.scenario) return refutedRefusal("tests", settled.refuted.map(withFailure));
        const failure = run.latest.get(locationOf(scenario))?.failure;
        return refutedRefusal("scenario", [failure === undefined ? pending.scenario : `${pending.scenario}, step "${failure.step}": ${failure.message}`]);
      }
      await settle(settled.repair, "refuted", lastCode);
      for (const test of settled.repair) {
        run.repaired.add(test);
        // Its repair is judged as a new test: it must fail again before its code.
        run.known.delete(test);
      }
      pending.tests = pending.tests.filter((test) => !settled.repair.includes(test));
      await undoLastCode();
      const repairOnce = once("test", judgeTests([...new Set(settled.repair.map((test) => test.split(" > ")[0]!))]));
      const repair = await repairOnce(refutedRefusal("tests", settled.repair.map(withFailure)));
      if (repair.refusal !== undefined) return repair.refusal;
    }
  };
  // A round: the test attempts, then the code attempts. One whose test attempt adds no test ends there, undone.
  const round = async (unchanged: Failing | undefined): Promise<RoundResult> => {
    const previous = unchanged === undefined ? undefined : stalledRefusal(description, unchanged);
    let undoNoTest = async (): Promise<void> => {};
    const tests = await withRetries(retries, async (refused) => {
      addedNoTest = false;
      const tried = await testOnce(refused ?? previous);
      undoNoTest = tried.rollback;
      return addedNoTest ? { ...tried, final: true } : tried;
    });
    if (addedNoTest) {
      await undoNoTest();
      return { added: false };
    }
    if (tests !== undefined) return { refusal: tests };
    const code = await codeRound();
    return code === undefined ? { added: true } : { refusal: code };
  };
  const end = await innerLoop(
    round,
    async () => failingOf(await runScenario()),
    failingOf(run.latest.get(locationOf(scenario))) ?? { step: "?", message: "" },
    { retries, rounds: run.rounds },
    (failure) => run.record({ event: "round", scenario: scenario.name, verdict: "no progress", step: failure.step, failure: withoutStack(failure.message) }),
  );
  if ("refusal" in end) return end.refusal;
  if ("stalled" in end) return stalledRefusal(description, end.stalled, run.reports);
  if ("limit" in end) throw new RoundLimitReached(roundLimitMessage(description, run.rounds, end.limit, run.reports), scenario.name);
  if (pending.scenario !== undefined) await settle([pending.scenario], "confirmed", lastAccepted);
  return undefined;
}

/** How a scenario's run fails, or nothing when it passes. */
function failingOf(result: ScenarioRun | undefined): Failing | undefined {
  if (result === undefined || result.status === "passed") return undefined;
  return { step: result.failure?.step ?? "?", message: result.failure?.message ?? result.status };
}

/** One attempt of `kind` for `scenario` in this run, with the run's executor, worktree and turn limit. */
async function attemptFor(run: FrRun, kind: AttemptKind, scenario: Scenario, previous: Refusal | undefined) {
  const location = locationOf(scenario);
  const context = await taskContext(run.worktree.dir, kind, run.texts, run.steps.get(location) ?? [], run.latest.get(location));
  await run.record({ event: "attempting", kind, scenario: scenario.name, retry: previous !== undefined });
  run.attempts += 1;
  const transcript = join(run.transcripts, `${String(run.attempts).padStart(2, "0")}-${kind}.jsonl`);
  return runAttempt({ executor: run.executor, kind, fr: run.fr, scenario, worktreeDir: run.worktree.dir, refusal: previous, turns: run.turns, context, transcript });
}

function locationOf(scenario: Scenario): string {
  return `${scenario.uri}:${scenario.line}`;
}

/** One code attempt and its judgment: the whole unit suite, and the scenarios built so far. */
function codeAttempt(run: FrRun, scenario: Scenario, previous: Refusal | undefined): Promise<Tried> {
  // Refused before its judgment, at its boundary or its turn limit, it leaves no test unsatisfied.
  run.unsatisfied = undefined;
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
  if (attempt.report !== undefined) run.reports.set(kind, attempt.report);
  const refusal = attempt.refusal ?? (await judge());
  await run.record(attemptEvent({ kind, scenario: scenario.name, refusal, retry: previous !== undefined, outcome: attempt.outcome }));
  if (refusal === undefined) await checkpoint(run.worktree, `${kind} attempt for "${scenario.name}"`);
  return { refusal, rollback: accepted.restore };
}

/** A code attempt's judgment: the whole unit suite, and the scenarios built so far. */
async function judgeCodeAttempt(run: FrRun): Promise<Refusal | undefined> {
  const { worktree, green, known } = run;
  const greenRuns = green.length === 0 ? [] : await runScenarios(worktree.dir, green, runCommand);
  const unit = await runUnitTests(worktree.dir, [], runCommand);
  for (const test of testsIn(unit)) known.add(test);
  // A file with no vitest test goes back to a test attempt, whose tests in it are new.
  for (const file of noTestSuiteFiles(unit)) known.delete(file);
  const refusal = judgeCode(unit, greenRuns);
  // Refused for its failing unit tests, and not for a test file the code cannot fix, which goes back to a test attempt.
  if (refusal !== undefined && refusal.sendTo === undefined && unit.ran && unit.failed.length > 0) run.unsatisfied = unit.failures ?? [];
  return refusal;
}

function runId(fr: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `${fr}-${stamp}`;
}
