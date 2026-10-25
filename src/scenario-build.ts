import { existsSync } from "node:fs";
import { join } from "node:path";
import { WRITABLE, isTestFile } from "./boundaries.ts";
import { runCommand } from "./command.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { type Judgment, judgeNewTests, judgeSteps, provisionalOf } from "./evidence.ts";
import type { Attempt, AttemptKind, Mutant, NextAttempt } from "./executor.ts";
import { RoundLimitReached } from "./limits.ts";
import { innerLoop, type RoundEnd, withoutStack } from "./inner-loop.ts";
import { importedSymbolsOf } from "./imported-symbols.ts";
import { type Pending, refutedRefusal, whenCodeRunsOut } from "./provisional.ts";
import { attemptEvent, attemptFor, codeAttempt, failingOf, type FrRun, locationOf, testCount } from "./run-attempts.ts";
import type { Refusal } from "./refusal.ts";
import { applyMutant, judgeScenarioUnderMutant, judgeTestsUnderMutant } from "./mutant.ts";
import { roundLimitMessage } from "./rounds.ts";
import { git } from "./git.ts";
import { type Tried, withRetries } from "./retries.ts";
import { runAllScenarios, runScenarios, type ScenarioRun } from "./scenarios.ts";
import { runUnitTests, testsIn } from "./unit-tests.ts";
import { acceptedWork, checkpoint, scratchCopy } from "./worktree.ts";

// One scenario's build (FR-RUN-02, FR-RUN-03): its steps attempt, then rounds of test and code attempts.

/** Builds one scenario: its step definitions, Red first, then rounds of test and code until it passes, keeping the green ones green. */
export function buildScenario(run: FrRun, scenario: Scenario): Promise<Refusal | undefined> {
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
  // The scenario passed after an accepted attempt that asked for something: the round ends there.
  private passed = false;
  private askedCode: Attempt["asked"];
  private beforeCode: string | undefined;
  // A mutant proved the scenario's steps, or a test attempt's tests that passed before their code (FR-EVID-03).
  private stepsByMutant = false;
  private testsByMutant = false;

  constructor(run: FrRun, scenario: Scenario) {
    this.run = run;
    this.scenario = scenario;
    this.description = `${scenario.uri}:${scenario.line} "${scenario.name}"`;
    this.testOnce = this.once("test", this.judgeTests([], { mutants: true }));
  }

  async build(): Promise<Refusal | undefined> {
    const { run, scenario } = this;
    const stepsRefusal = await withRetries(run.retries, this.once("steps", (files, mutant) => this.judgeStepsRun(files, mutant)));
    if (stepsRefusal !== undefined) return stepsRefusal;
    // Steps a mutant proved pass on the current code: the scenario is built, with no further attempt.
    if (this.stepsByMutant) return undefined;
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
  private once(kind: AttemptKind, judge: (files: string[], mutant?: Mutant) => Promise<Judgment>, asked?: Attempt["asked"]) {
    return async (previous: Refusal | undefined): Promise<Tried> => {
      const { run, scenario } = this;
      const accepted = await acceptedWork(run.worktree.dir);
      const attempt = await attemptFor(run, kind, scenario, previous, asked);
      if (attempt.report !== undefined) run.reports.set(kind, attempt.report);
      const judgment = attempt.refusal === undefined ? await judge(attempt.files, attempt.mutant) : { refusal: attempt.refusal, reds: [] };
      const refusal = judgment.refusal;
      // An accepted Red oid cannot classify waits for the code to confirm it.
      const provisional = refusal === undefined ? provisionalOf(judgment.reds) : [];
      if (kind === "steps" && provisional.length > 0) this.pending.scenario = provisional[0];
      if (kind === "test") this.pending.tests.push(...provisional);
      await run.record(
        attemptEvent({
          kind,
          scenario: scenario.name,
          refusal,
          retry: previous !== undefined,
          outcome: attempt.outcome,
          reds: judgment.reds,
          asked: asked !== undefined,
          ...(attempt.mutant === undefined ? {} : { mutant: attempt.mutant }),
        }),
      );
      if (refusal === undefined) await checkpoint(run.worktree, `${kind} attempt for "${scenario.name}"`);
      if (!(await this.asks(kind, attempt.next, refusal === undefined))) return { refusal, rollback: accepted.restore };
      // A request ends the round whatever the verdict: a refused attempt is undone now, and not retried.
      if (refusal !== undefined) await accepted.restore();
      return { refusal, rollback: async () => {}, final: true };
    };
  }

  /**
   * Records what an attempt's report asked for, and whether the run follows it: only once the rounds have started, and,
   * after an accepted attempt, only while the scenario still fails; when it passes, the round ends there.
   */
  private async asks(by: AttemptKind, next: NextAttempt | undefined, accepted: boolean): Promise<boolean> {
    if (next === undefined) return false;
    if (this.inRounds && accepted) this.passed = (await this.runScenario()).status === "passed";
    const followed = this.inRounds && !this.passed;
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
    this.passed = false;
    this.testsByMutant = false;
    // The attempt asked for works on the scenario's failure as it is now.
    if (request !== undefined) await this.runScenario();
    const retries = this.run.retries;
    const asked = request === undefined ? undefined : { by: request.by, reason: request.reason };
    if (request === undefined || request.kind !== "code") {
      const refusal = await withRetries(retries, request === undefined ? this.testOnce : this.askedOnce(request.kind, asked!));
      if (this.request !== undefined) return { request: this.request };
      if (refusal !== undefined) return { refusal };
      // Tests a mutant proved pass on the current code: when the scenario passes too, the round ends there.
      if (this.testsByMutant) this.passed = (await this.runScenario()).status === "passed";
      if (request?.kind === "steps" || this.passed) return undefined;
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
  private async judgeStepsRun(files: string[], mutant: Mutant | undefined): Promise<Judgment> {
    const result = await this.runScenario();
    if (result.status === "passed" && mutant !== undefined) return this.stepsUnderMutant(files, mutant);
    const stepFile = result.failure?.definedIn;
    const exists = await this.symbolsOf(stepFile === undefined ? [] : [stepFile]);
    return judgeSteps(result, (name) => exists(name, stepFile ?? ""), { offerMutant: true });
  }

  /** Steps whose scenario passes before its code, proved by a mutant: in a scratch copy, the scenario fails on an assertion. */
  private async stepsUnderMutant(files: string[], mutant: Mutant): Promise<Judgment> {
    const judged = await this.underMutant(files, mutant, async (dir) => {
      const result = (await runScenarios(dir, [this.scenario], runCommand))[0]!;
      const stepFile = result.failure?.definedIn;
      const exists = await importedSymbolsOf(dir, stepFile === undefined ? [] : [stepFile]);
      const refusal = judgeScenarioUnderMutant(result, (name) => exists(name, stepFile ?? ""));
      return refusal === undefined ? { reds: [`${this.description}: business_assertion (mutant)`] } : { refusal };
    });
    if ("refusal" in judged) return { refusal: judged.refusal, reds: [] };
    this.stepsByMutant = true;
    return { refusal: undefined, reds: judged.reds };
  }

  /** Runs `judge` in a scratch copy of the current code, with the attempt's files on top and the mutant applied. */
  private async underMutant(
    files: string[],
    mutant: Mutant,
    judge: (dir: string) => Promise<{ reds: string[] } | { refusal: Refusal }>,
  ): Promise<{ reds: string[] } | { refusal: Refusal }> {
    const scratch = await scratchCopy(this.run.worktree, await git(this.run.worktree.dir, "rev-parse", "HEAD"));
    try {
      await scratch.put(files, "attempt");
      const refusal = await applyMutant(scratch.dir, mutant);
      if (refusal !== undefined) return { refusal };
      return await judge(scratch.dir);
    } finally {
      await scratch.remove();
    }
  }

  /**
   * A test attempt's judgment: its new tests, in the files it changed and in `also`, a repaired test's file even if left
   * as it was. One that adds no test is accepted, and its round goes on to the code: the wiring path (docs/design.md §2).
   */
  private judgeTests(also: string[], { mutants = false }: { mutants?: boolean } = {}) {
    return async (files: string[], mutant?: Mutant): Promise<Judgment> => {
      const testFiles = [...new Set([...files.filter(isTestFile), ...also])];
      if (testFiles.length === 0) return { refusal: undefined, reds: [] };
      // Only a round's own test attempts may prove tests that pass before their code with a mutant (FR-EVID-03).
      const underMutant =
        mutants && mutant !== undefined
          ? (passing: string[]) =>
              this.underMutant(testFiles, mutant, async (dir) => {
                const unit = await runUnitTests(dir, testFiles, runCommand);
                return judgeTestsUnderMutant(unit, passing, await importedSymbolsOf(dir, testFiles));
              })
          : undefined;
      const judgment = await judgeNewTests(this.run.worktree.dir, testFiles, runCommand, await this.symbolsOf(testFiles), this.run.known, {
        offerMutant: mutants,
        ...(underMutant === undefined ? {} : { underMutant }),
      });
      if (judgment.refusal === undefined && judgment.reds.some((red) => red.endsWith(" (mutant)"))) this.testsByMutant = true;
      return judgment;
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
    if (!(await this.asks("code", tried.next, tried.refusal === undefined))) return tried;
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
