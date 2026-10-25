import { existsSync } from "node:fs";
import { join } from "node:path";
import { AgentError } from "./agent-error.ts";
import { runAttempt } from "./attempt.ts";
import { WRITABLE, isTestFile } from "./boundaries.ts";
import { runCommand } from "./command.ts";
import { ConfigError, readLimits, uncommittedProjectConfig } from "./config.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { type Judgment, judgeCode, judgeNewTests, judgeSteps, noTestSuiteFiles, provisionalOf } from "./evidence.ts";
import type { Attempt, AttemptKind, AttemptOutcome, Executor, NextAttempt } from "./executor.ts";
import { EXIT_BUILT, EXIT_ERROR, EXIT_LIMIT, EXIT_REFUSED } from "./exit.ts";
import { LimitReached, RoundLimitReached } from "./limits.ts";
import { missingCoverageProvider } from "./coverage.ts";
import { runGate } from "./gate.ts";
import { gateLoop } from "./gate-loop.ts";
import { type Failing, innerLoop, type RoundEnd, withoutStack } from "./inner-loop.ts";
import { importedSymbolsOf } from "./imported-symbols.ts";
import { type Pending, refutedRefusal, whenCodeRunsOut } from "./provisional.ts";
import { formatRefusal, type Refusal } from "./refusal.ts";
import { roundLimitMessage } from "./rounds.ts";
import { git } from "./git.ts";
import { type Tried, withRetries } from "./retries.ts";
import { type AttemptEvent, type LogEvent, startRunLog } from "./run-log.ts";
import { progressLine } from "./progress.ts";
import { summarize, transcriptsOf } from "./summary.ts";
import { oidVersion } from "./version.ts";
import { type FrTexts, frTexts, taskContext } from "./task-context.ts";
import { frScenarios, runAllScenarios, runScenarios, type ScenarioRun } from "./scenarios.ts";
import { runUnitTests, testsIn, type UnitRun } from "./unit-tests.ts";
import type { TestFailure } from "./vitest-report.ts";
import { acceptedWork, checkpoint, createRunWorktree, finishRun, freeRunId, type RunWorktree, scratchCopy } from "./worktree.ts";

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
  /** How many unit tests the last run of the whole suite ran: an attempt asked for must not leave fewer (FR-RUN-04). */
  tests: number;
  /** How many times a refused attempt is retried. */
  retries: number;
  /** How many turns an attempt's agent may take. */
  turns: number;
  /** How many rounds of test and code attempts a scenario may take (FR-RUN-09). */
  rounds: number;
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
  asked?: boolean;
}): AttemptEvent {
  const { kind, scenario, refusal, retry, reds = [] } = attempt;
  const { turns, model, tokens, cacheRead, cost, deniedToolCalls } = attempt.outcome;
  const verdict = attempt.verdict ?? (refusal === undefined ? "accepted" : "refused");
  const shown = { ...(attempt.asked === true ? { asked: true as const } : {}), ...(refusal === undefined ? {} : { refusal }), ...(reds.length === 0 ? {} : { reds }) };
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
  const baseline = await runUnitTests(worktree.dir, [], runCommand);
  const known = testsIn(baseline);
  const { retries, turns, rounds } = await readLimits(worktree.dir);
  const run: FrRun = { executor, fr, worktree, out, green: [], known, tests: testCount(baseline), retries, turns, rounds, reports: new Map(), record, texts: await frTexts(worktree.dir, fr), steps, latest: new Map(), transcripts, attempts: 0, repaired: new Set() };
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
function buildScenario(run: FrRun, scenario: Scenario): Promise<Refusal | undefined> {
  return new ScenarioBuild(run, scenario).build();
}

/**
 * One scenario's build (FR-RUN-02, FR-RUN-03), with what its attempts share: the provisional Reds the code has yet to
 * settle (FR-EVID-01), and the code attempts that settle them.
 */
class ScenarioBuild {
  private readonly run: FrRun;
  private readonly scenario: Scenario;
  private readonly description: string;
  private readonly pending: Pending = { tests: [] };
  // The last code attempt, and the last accepted one, by transcript number: the attempts that settle provisional Reds.
  private lastCode = 0;
  private lastAccepted = 0;
  private undoLastCode = async (): Promise<void> => {};
  private readonly testOnce: (previous: Refusal | undefined) => Promise<Tried>;
  // Requests are followed once the scenario's rounds start (FR-RUN-04): the one the round under way ended in, the code
  // attempts a request asked for, and the checkpoint before the scenario's first code attempt, the broken version an
  // attempt asked for must fail on.
  private inRounds = false;
  private request: Asked | undefined;
  private askedCode: Attempt["asked"];
  private beforeCode: string | undefined;

  constructor(run: FrRun, scenario: Scenario) {
    this.run = run;
    this.scenario = scenario;
    this.description = `${scenario.uri}:${scenario.line} "${scenario.name}"`;
    this.testOnce = this.once("test", this.judgeTests([]));
  }

  async build(): Promise<Refusal | undefined> {
    const { run, scenario } = this;
    const stepsRefusal = await withRetries(run.retries, this.once("steps", () => this.judgeStepsRun()));
    if (stepsRefusal !== undefined) return stepsRefusal;
    this.inRounds = true;
    const end = await innerLoop(
      this.round,
      async () => failingOf(await this.runScenario()),
      failingOf(run.latest.get(locationOf(scenario))) ?? { step: "?", message: "" },
      run.rounds,
      (failure) => run.record({ event: "round", scenario: scenario.name, verdict: "no progress", step: failure.step, failure: withoutStack(failure.message) }),
    );
    if ("refusal" in end) return end.refusal;
    if ("limit" in end) throw new RoundLimitReached(roundLimitMessage(this.description, run.rounds, end.limit, run.reports), scenario.name);
    if (this.pending.scenario !== undefined) await this.settle([this.pending.scenario], "confirmed", this.lastAccepted);
    return undefined;
  }

  /** One attempt and the judgment of its kind, from the work accepted before it; retried while refused, up to the run's retries (FR-RUN-07). */
  private once(kind: AttemptKind, judge: (files: string[]) => Promise<Judgment>, asked?: Attempt["asked"]) {
    return async (previous: Refusal | undefined): Promise<Tried> => {
      const { run, scenario } = this;
      const accepted = await acceptedWork(run.worktree.dir);
      const attempt = await attemptFor(run, kind, scenario, previous, asked);
      if (attempt.report !== undefined) run.reports.set(kind, attempt.report);
      const judgment = attempt.refusal === undefined ? await judge(attempt.files) : { refusal: attempt.refusal, reds: [] };
      const refusal = judgment.refusal;
      // An accepted Red oid cannot classify waits for the code to confirm it.
      const provisional = refusal === undefined ? provisionalOf(judgment.reds) : [];
      if (kind === "steps" && provisional.length > 0) this.pending.scenario = provisional[0];
      if (kind === "test") this.pending.tests.push(...provisional);
      await run.record(
        attemptEvent({ kind, scenario: scenario.name, refusal, retry: previous !== undefined, outcome: attempt.outcome, reds: judgment.reds, asked: asked !== undefined }),
      );
      if (refusal === undefined) await checkpoint(run.worktree, `${kind} attempt for "${scenario.name}"`);
      if (!(await this.asks(kind, attempt.next))) return { refusal, rollback: accepted.restore };
      // A request ends the round whatever the verdict: a refused attempt is undone now, and not retried.
      if (refusal !== undefined) await accepted.restore();
      return { refusal, rollback: async () => {}, final: true };
    };
  }

  /** Records what an attempt's report asked for, and whether the run follows it: only once the rounds have started. */
  private async asks(by: AttemptKind, next: NextAttempt | undefined): Promise<boolean> {
    if (next === undefined) return false;
    const followed = this.inRounds;
    await this.run.record({ event: "request", scenario: this.scenario.name, by, kind: next.kind, reason: next.reason, followed });
    if (followed) this.request = { by, ...next };
    return followed;
  }

  /**
   * A round: test attempts, then code attempts, or the attempt a request asked for. A steps attempt asked for ends the
   * round, and the scenario runs again; a test attempt asked for is followed by the round's code attempts.
   */
  private readonly round = async (request: Asked | undefined): Promise<RoundEnd<Asked>> => {
    this.request = undefined;
    // The attempt asked for works on the scenario's failure as it is now.
    if (request !== undefined) await this.runScenario();
    const retries = this.run.retries;
    const asked = request === undefined ? undefined : { by: request.by, reason: request.reason };
    if (request === undefined || request.kind !== "code") {
      const refusal = await withRetries(retries, request === undefined ? this.testOnce : this.askedOnce(request.kind, asked!));
      if (this.request !== undefined) return { request: this.request };
      if (refusal !== undefined) return { refusal };
      if (request?.kind === "steps") return undefined;
    }
    this.askedCode = request?.kind === "code" ? asked : undefined;
    const refusal = await this.codeRound();
    this.askedCode = undefined;
    if (this.request !== undefined) return { request: this.request };
    return refusal === undefined ? undefined : { refusal };
  };

  /**
   * A steps or test attempt another one asked for (FR-RUN-04), judged by D-02 on the code from before the scenario's
   * first code attempt, and by keeping the unit tests and every scenario that passed just before it.
   */
  private askedOnce(kind: AttemptKind, asked: NonNullable<Attempt["asked"]>) {
    return async (previous: Refusal | undefined): Promise<Tried> => {
      const passing = await this.passingScenarios();
      const base = this.beforeCode ?? (await git(this.run.worktree.dir, "rev-parse", "HEAD"));
      return this.once(kind, (files) => this.judgeAsked(kind, files, passing, base), asked)(previous);
    };
  }

  /** The scenarios of the project that pass now, by `<uri>:<line>`. */
  private async passingScenarios(): Promise<Set<string>> {
    const { results } = await runAllScenarios(this.run.worktree.dir, runCommand);
    return new Set(results.filter((result) => result.status === "passed").map(locationOf));
  }

  private async judgeAsked(kind: AttemptKind, files: string[], passing: Set<string>, base: string): Promise<Judgment> {
    const { run } = this;
    const written = files.filter((file) => WRITABLE[kind].some((path) => file.startsWith(path)));
    if (kind === "test") {
      const unit = await runUnitTests(run.worktree.dir, [], runCommand);
      if (unit.ran && testCount(unit) < run.tests) return { refusal: fewerTests(run.tests, testCount(unit)), reds: [] };
      for (const test of testsIn(unit)) run.known.add(test);
    }
    const { results } = await runAllScenarios(run.worktree.dir, runCommand);
    const turnedRed = results.filter((result) => passing.has(locationOf(result)) && result.status !== "passed");
    if (turnedRed.length > 0) return { refusal: turnedRedRefusal(turnedRed), reds: [] };
    const scratch = await scratchCopy(run.worktree, base);
    try {
      if (kind === "steps") {
        await scratch.put(written, "attempt");
        const result = (await runScenarios(scratch.dir, [this.scenario], runCommand))[0]!;
        const stepFile = result.failure?.definedIn;
        const exists = await importedSymbolsOf(scratch.dir, stepFile === undefined ? [] : [stepFile]);
        return judgeSteps(result, (name) => exists(name, stepFile ?? ""));
      }
      const testFiles = written.filter(isTestFile);
      if (testFiles.length === 0) return { refusal: undefined, reds: [] };
      // The tests that passed there as they were before this attempt are not its to prove; any other must fail.
      await scratch.put(testFiles, "checkpoint");
      const before = testFiles.filter((file) => existsSync(join(scratch.dir, file)));
      const passedBefore = before.length === 0 ? [] : (await runUnitTests(scratch.dir, before, runCommand)).passed;
      await scratch.put(testFiles, "attempt");
      // Awaited here: the scratch copy is removed in finally, once the judgment is done.
      return await judgeNewTests(scratch.dir, testFiles, runCommand, await importedSymbolsOf(scratch.dir, testFiles), new Set(passedBefore));
    } finally {
      await scratch.remove();
    }
  }

  private async runScenario(): Promise<ScenarioRun> {
    const result = (await runScenarios(this.run.worktree.dir, [this.scenario], runCommand))[0]!;
    this.run.latest.set(locationOf(this.scenario), result);
    return result;
  }

  /** Whether names exist, asked at each judgment, of the files that failed: the project changes with every attempt. */
  private symbolsOf(files: string[]) {
    return importedSymbolsOf(this.run.worktree.dir, files);
  }

  /** A steps attempt's judgment: its scenario fails with a Red. */
  private async judgeStepsRun(): Promise<Judgment> {
    const result = await this.runScenario();
    const stepFile = result.failure?.definedIn;
    const exists = await this.symbolsOf(stepFile === undefined ? [] : [stepFile]);
    return judgeSteps(result, (name) => exists(name, stepFile ?? ""));
  }

  /**
   * A test attempt's judgment: its new tests, in the files it changed and in `also`, a repaired test's file even if left
   * as it was. One that adds no test is accepted, and its round goes on to the code: the wiring path (docs/design.md §2).
   */
  private judgeTests(also: string[]) {
    return async (files: string[]): Promise<Judgment> => {
      const testFiles = [...new Set([...files.filter(isTestFile), ...also])];
      if (testFiles.length === 0) return { refusal: undefined, reds: [] };
      return judgeNewTests(this.run.worktree.dir, testFiles, runCommand, await this.symbolsOf(testFiles), this.run.known);
    };
  }

  private async settle(what: string[], verdict: "confirmed" | "refuted", attempt: number): Promise<void> {
    for (const one of what) await this.run.record({ event: "red", what: one, verdict, attempt });
  }

  /** A code attempt. An accepted one makes every unit test pass: it confirms the provisional tests. */
  private readonly settledCode = async (previous: Refusal | undefined): Promise<Tried> => {
    this.beforeCode ??= await git(this.run.worktree.dir, "rev-parse", "HEAD");
    const tried = await codeAttempt(this.run, this.scenario, previous, this.askedCode);
    this.lastCode = this.run.attempts;
    this.undoLastCode = tried.rollback;
    if (tried.refusal === undefined) {
      this.lastAccepted = this.lastCode;
      await this.settle(this.pending.tests, "confirmed", this.lastCode);
      this.pending.tests = [];
    }
    if (!(await this.asks("code", tried.next))) return tried;
    // A request ends the round whatever the verdict: a refused attempt is undone now, and not retried.
    if (tried.refusal !== undefined) await tried.rollback();
    return { ...tried, rollback: async () => {}, final: true };
  };

  /**
   * A code attempt's retry; a refusal the code cannot act on goes back to a test attempt first, and the pair counts as
   * one retry (FR-RUN-03). A refused test attempt there sends the next retry to a test attempt again.
   */
  private readonly codeRetry = async (previous: Refusal | undefined): Promise<Tried> => {
    if (previous?.sendTo !== "test") return this.settledCode(previous);
    const test = await this.testOnce(previous);
    if (this.request !== undefined) return test;
    if (test.refusal !== undefined) return { ...test, refusal: { ...test.refusal, sendTo: "test" } };
    return this.settledCode(undefined);
  };

  /**
   * The code attempts, and when they run out with a provisional Red still failing, its refutation: a provisional test
   * goes back to one test attempt, then to the code attempts again; a refuted scenario stops the run (FR-EVID-01).
   */
  private async codeRound(): Promise<Refusal | undefined> {
    for (;;) {
      const refusal = await withRetries(this.run.retries, this.codeRetry);
      if (refusal === undefined || this.request !== undefined) return undefined;
      const unsatisfied = this.run.unsatisfied;
      const settled = whenCodeRunsOut(this.pending, this.run.repaired, unsatisfied?.map((failure) => failure.test));
      if (settled === undefined) return refusal;
      const withFailure = (test: string): string => {
        const failure = unsatisfied?.find((one) => one.test === test);
        return failure === undefined ? test : `${test}: ${failure.message}`;
      };
      if ("refuted" in settled) return this.refuted(settled.refuted, withFailure);
      const repair = await this.repair(settled.repair, withFailure);
      if (this.request !== undefined) return undefined;
      if (repair !== undefined) return repair;
    }
  }

  /** The refusal the run stops on for refuted Reds: tests after their repair, or the scenario. */
  private async refuted(what: string[], withFailure: (test: string) => string): Promise<Refusal> {
    await this.settle(what, "refuted", this.lastCode);
    const scenario = this.pending.scenario;
    if (what[0] !== scenario) return refutedRefusal("tests", what.map(withFailure));
    const failure = this.run.latest.get(locationOf(this.scenario))?.failure;
    return refutedRefusal("scenario", [failure === undefined ? scenario : `${scenario}, step "${failure.step}": ${failure.message}`]);
  }

  /** A refuted test's one repair: a test attempt with the refusal, from the code before the last code attempt; its refusal, if any. */
  private async repair(tests: string[], withFailure: (test: string) => string): Promise<Refusal | undefined> {
    await this.settle(tests, "refuted", this.lastCode);
    for (const test of tests) {
      this.run.repaired.add(test);
      // Its repair is judged as a new test: it must fail again before its code.
      this.run.known.delete(test);
    }
    this.pending.tests = this.pending.tests.filter((test) => !tests.includes(test));
    await this.undoLastCode();
    const repairOnce = this.once("test", this.judgeTests([...new Set(tests.map((test) => test.split(" > ")[0]!))]));
    return (await repairOnce(refutedRefusal("tests", tests.map(withFailure)))).refusal;
  }
}

/** How a scenario's run fails, or nothing when it passes. */
function failingOf(result: ScenarioRun | undefined): Failing | undefined {
  if (result === undefined || result.status === "passed") return undefined;
  return { step: result.failure?.step ?? "?", message: result.failure?.message ?? result.status };
}

/** One attempt of `kind` for `scenario` in this run, with the run's executor, worktree and turn limit. */
async function attemptFor(run: FrRun, kind: AttemptKind, scenario: Scenario, previous: Refusal | undefined, asked?: Attempt["asked"]) {
  const location = locationOf(scenario);
  const context = await taskContext(run.worktree.dir, kind, run.texts, run.steps.get(location) ?? [], run.latest.get(location), { asked: asked !== undefined });
  await run.record({ event: "attempting", kind, scenario: scenario.name, retry: previous !== undefined });
  run.attempts += 1;
  const transcript = join(run.transcripts, `${String(run.attempts).padStart(2, "0")}-${kind}.jsonl`);
  return runAttempt({ executor: run.executor, kind, fr: run.fr, scenario, worktreeDir: run.worktree.dir, refusal: previous, turns: run.turns, context, transcript, asked });
}

function locationOf(scenario: Scenario): string {
  return `${scenario.uri}:${scenario.line}`;
}

/** One code attempt and its judgment: the whole unit suite, and the scenarios built so far. */
function codeAttempt(run: FrRun, scenario: Scenario, previous: Refusal | undefined, asked?: Attempt["asked"]): Promise<Tried & { next?: NextAttempt }> {
  // Refused before its judgment, at its boundary or its turn limit, it leaves no test unsatisfied.
  run.unsatisfied = undefined;
  return checkpointedAttempt(run, "code", scenario, previous, () => judgeCodeAttempt(run), asked);
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
  asked?: Attempt["asked"],
): Promise<Tried & { next?: NextAttempt }> {
  const accepted = await acceptedWork(run.worktree.dir);
  const attempt = await attemptFor(run, kind, scenario, previous, asked);
  if (attempt.report !== undefined) run.reports.set(kind, attempt.report);
  const refusal = attempt.refusal ?? (await judge());
  await run.record(attemptEvent({ kind, scenario: scenario.name, refusal, retry: previous !== undefined, outcome: attempt.outcome, asked: asked !== undefined }));
  if (refusal === undefined) await checkpoint(run.worktree, `${kind} attempt for "${scenario.name}"`);
  return { refusal, rollback: accepted.restore, ...(attempt.next === undefined ? {} : { next: attempt.next }) };
}

/** A code attempt's judgment: the whole unit suite, and the scenarios built so far. */
async function judgeCodeAttempt(run: FrRun): Promise<Refusal | undefined> {
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

/** What a round ended asking for: the kind asked for, which kind asked, and why (FR-RUN-04). */
type Asked = NextAttempt & { by: AttemptKind };

function fewerTests(before: number, now: number): Refusal {
  return {
    failed: "The attempt left fewer unit tests",
    evidence: `The unit suite ran ${before} tests before this attempt, and ${now} after it`,
    next: "Keep every unit test: change the ones that are wrong, without removing them",
  };
}

function turnedRedRefusal(scenarios: ScenarioRun[]): Refusal {
  return {
    failed: "Scenarios that passed before this attempt no longer pass",
    evidence: scenarios.map((scenario) => `${scenario.uri}:${scenario.line} "${scenario.name}": ${scenario.status}`).join("\n"),
    next: "Keep every scenario that passed passing: the step definitions you change must hold for each scenario that uses them",
  };
}

/** How many unit tests a run of the suite ran, passing or failing. */
function testCount(unit: UnitRun): number {
  return unit.passed.length + (unit.failures ?? []).length;
}

function runId(fr: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `${fr}-${stamp}`;
}
