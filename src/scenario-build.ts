import { isTestFile } from "./boundaries.ts";
import { judgeAsked, passingScenarios } from "./asked-judgment.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { type Judgment, judgeNewTests, judgeSteps, provisionalOf } from "./evidence.ts";
import type { Attempt, AttemptKind, Mutant, NextAttempt } from "./executor.ts";
import { git } from "./git.ts";
import { importedSymbolsOf } from "./imported-symbols.ts";
import { innerLoop, type RoundEnd, withoutStack } from "./inner-loop.ts";
import { RoundLimitReached } from "./limits.ts";
import { stepsUnderMutant, testsUnderMutant } from "./mutant.ts";
import { refutedRefusal, whenCodeRunsOut } from "./provisional.ts";
import type { Refusal } from "./refusal.ts";
import { type Tried, withRetries } from "./retries.ts";
import { roundLimitMessage } from "./rounds.ts";
import { attemptEvent, attemptFor, codeAttempt, failingOf, type FrRun, locationOf } from "./run-attempts.ts";
import {
  afterCode,
  afterOpening,
  type Asked,
  builtBySteps,
  checksScenarioFirst,
  followsRequest,
  onCodeAccepted,
  onFollowedRequest,
  onRepair,
  roundOpening,
  type ScenarioState,
  startingState,
  startRound,
  takesMutant,
} from "./scenario-state.ts";
import { runScenarios, type ScenarioRun } from "./scenarios.ts";
import { acceptedWork, checkpoint } from "./worktree.ts";

/** Builds one scenario: its step definitions, Red first, then rounds of test and code until it passes, keeping the green ones green. */
export function buildScenario(run: FrRun, scenario: Scenario): Promise<Refusal | undefined> {
  return new ScenarioBuild(run, scenario).build();
}

/**
 * One scenario's build (FR-RUN-02, FR-RUN-03): the attempts, checkpoints, scratch copies and log entries around the
 * state and decisions of scenario-state.ts, which say what comes next.
 */
class ScenarioBuild {
  private readonly run: FrRun;
  private readonly scenario: Scenario;
  private readonly description: string;
  private state: ScenarioState = startingState();
  // What the last code attempt undoes, and the request a round's code attempts work on.
  private undoLastCode = async (): Promise<void> => {};
  private askedCode: Attempt["asked"];
  private readonly testOnce: (previous: Refusal | undefined) => Promise<Tried>;

  constructor(run: FrRun, scenario: Scenario) {
    this.run = run;
    this.scenario = scenario;
    this.description = `${scenario.uri}:${scenario.line} "${scenario.name}"`;
    this.testOnce = this.once("test", this.judgeTests([], "own"));
  }

  async build(): Promise<Refusal | undefined> {
    const { run, scenario } = this;
    const stepsRefusal = await withRetries(run.retries, this.once("steps", (files, mutant) => this.judgeStepsRun(files, mutant)));
    if (stepsRefusal !== undefined) return stepsRefusal;
    if (builtBySteps(this.state)) return undefined;
    const end = await innerLoop(
      this.round,
      async () => failingOf(await this.runScenario()),
      failingOf(run.latest.get(locationOf(scenario))) ?? { step: "?", message: "" },
      run.rounds,
      (failure) => run.record({ event: "round", scenario: scenario.name, verdict: "no progress", step: failure.step, failure: withoutStack(failure.message) }),
    );
    if ("refusal" in end) return end.refusal;
    if ("limit" in end) throw new RoundLimitReached(roundLimitMessage(this.description, run.rounds, end.limit, run.reports), scenario.name);
    if (this.state.pending.scenario !== undefined) await this.settle([this.state.pending.scenario], "confirmed", this.state.lastAccepted);
    return undefined;
  }

  /** A round: its opening attempts, the round's test attempts or the attempt a request asked for, then its code attempts. */
  private readonly round = async (request: Asked | undefined): Promise<RoundEnd<Asked>> => {
    this.state = startRound(this.state);
    // The attempt asked for works on the scenario's failure as it is now.
    if (request !== undefined) await this.runScenario();
    const opening = roundOpening(request);
    if (opening.kind !== "code") {
      const refusal = await withRetries(this.run.retries, opening.asked === undefined ? this.testOnce : this.askedOnce(opening.kind, opening.asked));
      // Tests a mutant proved pass on the current code: when the scenario passes too, the round ends there.
      if (this.state.request === undefined && refusal === undefined && this.state.provedByMutant.tests) {
        this.state = { ...this.state, passed: (await this.runScenario()).status === "passed" };
      }
      const next = afterOpening(opening.kind, { refusal, request: this.state.request, passed: this.state.passed });
      if (next !== "code") return next.end;
    }
    this.askedCode = opening.kind === "code" ? opening.asked : undefined;
    const refusal = await this.codeRound();
    this.askedCode = undefined;
    return afterCode({ refusal, request: this.state.request });
  };

  /** One attempt and the judgment of its kind, from the work accepted before it; retried while refused, up to the run's retries (FR-RUN-07). */
  private once(kind: AttemptKind, judge: (files: string[], mutant?: Mutant) => Promise<Judgment>, asked?: Attempt["asked"]) {
    return async (previous: Refusal | undefined): Promise<Tried> => {
      const { run, scenario } = this;
      const accepted = await acceptedWork(run.worktree.dir);
      const attempt = await attemptFor(run, kind, scenario, previous, asked);
      if (attempt.report !== undefined) run.reports.set(kind, attempt.report);
      const judgment = attempt.refusal === undefined ? await judge(attempt.files, attempt.mutant) : { refusal: attempt.refusal, reds: [] };
      const refusal = judgment.refusal;
      this.keepProvisional(kind, refusal === undefined ? provisionalOf(judgment.reds) : []);
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
      const followed = onFollowedRequest(refusal !== undefined);
      if (followed.undoNow) await accepted.restore();
      return { refusal, rollback: async () => {}, final: followed.final };
    };
  }

  /** An accepted Red oid cannot classify waits for the code to confirm it (FR-EVID-01). */
  private keepProvisional(kind: AttemptKind, provisional: string[]): void {
    const { pending } = this.state;
    if (kind === "steps" && provisional.length > 0) this.state = { ...this.state, pending: { ...pending, scenario: provisional[0] } };
    if (kind === "test") this.state = { ...this.state, pending: { ...pending, tests: [...pending.tests, ...provisional] } };
  }

  /** Records what an attempt's report asked for, and whether the run follows it (FR-RUN-04). */
  private async asks(by: AttemptKind, next: NextAttempt | undefined, accepted: boolean): Promise<boolean> {
    if (next === undefined) return false;
    if (checksScenarioFirst(this.state.phase, accepted)) this.state = { ...this.state, passed: (await this.runScenario()).status === "passed" };
    const followed = followsRequest(this.state.phase, this.state.passed);
    await this.run.record({ event: "request", scenario: this.scenario.name, by, kind: next.kind, reason: next.reason, followed });
    if (followed) this.state = { ...this.state, request: { by, ...next } };
    return followed;
  }

  /** A steps or test attempt another one asked for (FR-RUN-04), judged by asked-judgment.ts. */
  private askedOnce(kind: AttemptKind, asked: NonNullable<Attempt["asked"]>) {
    return async (previous: Refusal | undefined): Promise<Tried> => {
      const passing = await passingScenarios(this.run.worktree.dir, this.run.check("attempt"));
      const base = this.state.beforeCode ?? (await git(this.run.worktree.dir, "rev-parse", "HEAD"));
      return this.once(kind, (files) => judgeAsked(this.run, this.scenario, kind, files, passing, base), asked)(previous);
    };
  }

  private async runScenario(): Promise<ScenarioRun> {
    const result = (await runScenarios(this.run.worktree.dir, [this.scenario], this.run.check("attempt")))[0]!;
    this.run.latest.set(locationOf(this.scenario), result);
    return result;
  }

  /** Whether names exist, asked at each judgment, of the files that failed: the project changes with every attempt. */
  private symbolsOf(files: string[]) {
    return importedSymbolsOf(this.run.worktree.dir, files);
  }

  /** A steps attempt's judgment: its scenario fails with a Red, or passes and a mutant proves it (FR-EVID-03). */
  private async judgeStepsRun(files: string[], mutant: Mutant | undefined): Promise<Judgment> {
    const result = await this.runScenario();
    const takes = takesMutant("steps", this.state.phase, "own");
    if (result.status === "passed" && mutant !== undefined && takes) {
      const judged = await stepsUnderMutant(this.run.worktree, this.run.layout.writable.code, this.scenario, files, mutant, this.run.check("mutant"));
      if ("refusal" in judged) return { refusal: judged.refusal, reds: [] };
      this.state = { ...this.state, provedByMutant: { ...this.state.provedByMutant, steps: true } };
      return { refusal: undefined, reds: judged.reds };
    }
    const stepFile = result.failure?.definedIn;
    const exists = await this.symbolsOf(stepFile === undefined ? [] : [stepFile]);
    return judgeSteps(result, (name) => exists(name, stepFile ?? ""), { offerMutant: takes });
  }

  /**
   * A test attempt's judgment: its new tests, in the files it changed and in `also`, a repaired test's file even if left
   * as it was. One that adds no test is accepted, and its round goes on to the code: the wiring path (docs/design.md §2).
   */
  private judgeTests(also: string[], origin: "own" | "repair") {
    return async (files: string[], mutant?: Mutant): Promise<Judgment> => {
      const testFiles = [...new Set([...files.filter((file) => isTestFile(file, this.run.layout)), ...also])];
      if (testFiles.length === 0) return { refusal: undefined, reds: [] };
      const takes = takesMutant("test", this.state.phase, origin);
      const underMutant = takes && mutant !== undefined ? (passing: string[]) => testsUnderMutant(this.run.worktree, this.run.layout.writable.code, testFiles, mutant, passing, this.run.check("mutant")) : undefined;
      const judgment = await judgeNewTests(this.run.worktree.dir, testFiles, this.run.check("attempt"), await this.symbolsOf(testFiles), this.run.known, {
        offerMutant: takes,
        ...(underMutant === undefined ? {} : { underMutant }),
      });
      if (judgment.refusal === undefined && judgment.reds.some((red) => red.endsWith(" (mutant)"))) {
        this.state = { ...this.state, provedByMutant: { ...this.state.provedByMutant, tests: true } };
      }
      return judgment;
    };
  }

  private async settle(what: string[], verdict: "confirmed" | "refuted", attempt: number): Promise<void> {
    for (const one of what) await this.run.record({ event: "red", what: one, verdict, attempt });
  }

  /** A code attempt. An accepted one makes every unit test pass: it confirms the provisional tests. */
  private readonly settledCode = async (previous: Refusal | undefined): Promise<Tried> => {
    if (this.state.beforeCode === undefined) this.state = { ...this.state, beforeCode: await git(this.run.worktree.dir, "rev-parse", "HEAD") };
    const tried = await codeAttempt(this.run, this.scenario, previous, this.askedCode);
    this.state = { ...this.state, lastCode: this.run.attempts };
    this.undoLastCode = tried.rollback;
    if (tried.refusal === undefined) {
      const { state, confirmed } = onCodeAccepted(this.state, this.state.lastCode);
      this.state = state;
      await this.settle(confirmed, "confirmed", this.state.lastCode);
    }
    if (!(await this.asks("code", tried.next, tried.refusal === undefined))) return tried;
    const followed = onFollowedRequest(tried.refusal !== undefined);
    if (followed.undoNow) await tried.rollback();
    return { ...tried, rollback: async () => {}, final: followed.final };
  };

  /**
   * A code attempt's retry; a refusal the code cannot act on goes back to a test attempt first, and the pair counts as
   * one retry (FR-RUN-03). A refused test attempt there sends the next retry to a test attempt again.
   */
  private readonly codeRetry = async (previous: Refusal | undefined): Promise<Tried> => {
    if (previous?.sendTo !== "test") return this.settledCode(previous);
    const test = await this.testOnce(previous);
    if (this.state.request !== undefined) return test;
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
      if (refusal === undefined || this.state.request !== undefined) return undefined;
      const unsatisfied = this.run.unsatisfied;
      const settled = whenCodeRunsOut(this.state.pending, this.run.repaired, unsatisfied?.map((failure) => failure.test));
      if (settled === undefined) return refusal;
      const withFailure = (test: string): string => {
        const failure = unsatisfied?.find((one) => one.test === test);
        return failure === undefined ? test : `${test}: ${failure.message}`;
      };
      if ("refuted" in settled) return this.refuted(settled.refuted, withFailure);
      const repair = await this.repair(settled.repair, withFailure);
      if (this.state.request !== undefined) return undefined;
      if (repair !== undefined) return repair;
    }
  }

  /** The refusal the run stops on for refuted Reds: tests after their repair, or the scenario. */
  private async refuted(what: string[], withFailure: (test: string) => string): Promise<Refusal> {
    await this.settle(what, "refuted", this.state.lastCode);
    const scenario = this.state.pending.scenario;
    if (what[0] !== scenario) return refutedRefusal("tests", what.map(withFailure), this.run.layout.writable.code);
    const failure = this.run.latest.get(locationOf(this.scenario))?.failure;
    return refutedRefusal("scenario", [failure === undefined ? scenario : `${scenario}, step "${failure.step}": ${failure.message}`], this.run.layout.writable.code);
  }

  /** A refuted test's one repair: a test attempt with the refusal, from the code before the last code attempt; its refusal, if any. */
  private async repair(tests: string[], withFailure: (test: string) => string): Promise<Refusal | undefined> {
    await this.settle(tests, "refuted", this.state.lastCode);
    for (const test of tests) {
      this.run.repaired.add(test);
      // Its repair is judged as a new test: it must fail again before its code.
      this.run.known.delete(test);
    }
    this.state = onRepair(this.state, tests);
    await this.undoLastCode();
    const repairOnce = this.once("test", this.judgeTests([...new Set(tests.map((test) => test.split(" > ")[0]!))], "repair"));
    return (await repairOnce(refutedRefusal("tests", tests.map(withFailure), this.run.layout.writable.code))).refusal;
  }
}
