import { AgentError } from "./agent-error.ts";
import { runCommand } from "./command.ts";
import { ConfigError, readLimits, uncommittedProjectConfig } from "./config.ts";
import type { Scenario } from "./cucumber-messages.ts";
import type { AttemptKind, Executor } from "./executor.ts";
import { EXIT_BUILT, EXIT_ERROR, EXIT_LIMIT, EXIT_REFUSED } from "./exit.ts";
import { LimitReached, RoundLimitReached } from "./limits.ts";
import { missingCoverageProvider } from "./coverage.ts";
import { runGate } from "./gate.ts";
import { gateLoop } from "./gate-loop.ts";
import { attemptEvent, checkpointedAttempt, codeAttempt, type FrRun, locationOf, testCount } from "./run-attempts.ts";
import { buildScenario } from "./scenario-build.ts";
import { brokenBaseRefusal, gateScope, runIdOf, startingScenarios } from "./run-plan.ts";
import { git } from "./git.ts";
import { formatRefusal, type Refusal } from "./refusal.ts";
import type { Tried } from "./retries.ts";
import { type LogEvent, startRunLog } from "./run-log.ts";
import { progressLine } from "./progress.ts";
import { summarize, transcriptsOf } from "./summary.ts";
import { oidVersion } from "./version.ts";
import { frTexts } from "./task-context.ts";
import { frScenarios, runAllScenarios } from "./scenarios.ts";
import { runUnitTests, testsIn } from "./unit-tests.ts";
import { commitFr, createRunWorktree, finishRun, freeRunId, type RunWorktree } from "./worktree.ts";

export interface RunOptions {
  projectDir: string;
  /** The FRs to build, in order (FR-RUN-05). */
  frs: string[];
  /** The executor, or how to make it once the run starts: the real one reads the person's config. */
  executor: Executor | (() => Promise<Executor>);
  out: (text: string) => void;
}


/** Builds one FR in its own worktree and commits it on the run's branch; returns the exit code. */
export async function runFr(options: RunOptions): Promise<number> {
  // A silently ignored edit would be a check that does not tell the truth (NFR-02, NFR-08).
  if (await uncommittedProjectConfig(options.projectDir)) {
    options.out(".oid.json has changes that are not committed: this run reads the project's config from HEAD and does not use them; commit them for them to count.\n");
  }
  // The log starts before the worktree, so that every stage, the first included, is in it and shown (FR-CLI-05).
  const id = await freeRunId(options.projectDir, runIdOf(options.frs, stamp()));
  const log = await startRunLog(options.projectDir, id, (event) => {
    const line = progressLine(event);
    if (line !== undefined) options.out(`${line}\n`);
  });
  const record = log.record;
  await record({ event: "plan", frs: options.frs });
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
    exitCode = await buildFrs({ ...options, executor }, worktree, record, transcriptsOf(log.path));
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
    // The worktree goes however the run ends; a run that built every FR drops its checkpoints.
    if (worktree !== undefined) await finishRun(worktree, exitCode === EXIT_BUILT);
    if (exitCode !== undefined) {
      await log.end(exitCode);
      options.out(summarize(log.events, log.path));
    }
  }
}

/**
 * Builds the run's FRs in order (FR-RUN-05), each with its own gate and commit; returns the exit code. Every scenario
 * runs once first (FR-RUN-10): a built FR that is broken refuses the run, and the FRs not built yet stay out of the
 * gates until the run builds them (FR-GATE-01).
 */
async function buildFrs(
  { frs, executor, out }: RunOptions & { executor: Executor },
  worktree: RunWorktree,
  record: (event: LogEvent) => Promise<void>,
  transcripts: string,
): Promise<number> {
  await record({ event: "stage", stage: "scenarios" });
  const listed: { fr: string; scenarios: Scenario[]; steps: Map<string, string[]> }[] = [];
  for (const fr of frs) {
    const { scenarios, steps } = await frScenarios(worktree.dir, fr, runCommand);
    if (scenarios.length === 0) {
      await record({ event: "start", oid: oidVersion(), fr, scenarios, branch: worktree.branch, checkpoints: worktree.checkpoints });
      return stop(`cucumber-js finds no scenario for ${fr}: check the project's cucumber-js configuration and the tag @${fr} on its feature file.`, out);
    }
    listed.push({ fr, scenarios, steps });
  }
  const { results } = await runAllScenarios(worktree.dir, runCommand);
  const start = startingScenarios(results, new Set(listed.flatMap(({ scenarios }) => scenarios.map(locationOf))));
  if (start.broken.length > 0) return refuse(brokenBaseRefusal(start.broken), out);
  const noProvider = missingCoverageProvider(worktree.dir);
  if (noProvider !== undefined) return stop(noProvider, out);
  await record({ event: "stage", stage: "unit tests" });
  const baseline = await runUnitTests(worktree.dir, [], runCommand);
  const { retries, turns, rounds } = await readLimits(worktree.dir);
  // One run for every FR: the scenarios built, the tests there are, the transcripts' numbering are the run's.
  const run: FrRun = {
    executor,
    fr: listed[0]!.fr,
    worktree,
    out,
    green: [],
    known: testsIn(baseline),
    tests: testCount(baseline),
    retries,
    turns,
    rounds,
    reports: new Map(),
    record,
    texts: await frTexts(worktree.dir, listed[0]!.fr),
    steps: listed[0]!.steps,
    latest: new Map(),
    transcripts,
    attempts: 0,
    repaired: new Set(),
  };
  const all = results.map(({ uri, line, name }) => ({ uri, line, name }));
  let since = worktree.start;
  for (const { fr, scenarios, steps } of listed) {
    await record({ event: "start", oid: oidVersion(), fr, scenarios, branch: worktree.branch, checkpoints: worktree.checkpoints });
    Object.assign(run, { fr, steps, texts: await frTexts(worktree.dir, fr) });
    const exitCode = await buildOneFr(run, scenarios, all, start.passing, since);
    if (exitCode !== EXIT_BUILT) return exitCode;
    await record({ event: "stage", stage: "commit" });
    await commitFr(worktree, since, `feat(${fr}): built by oid run`);
    await record({ event: "built", fr });
    since = await git(worktree.dir, "rev-parse", "HEAD");
  }
  return EXIT_BUILT;
}

/** Builds one FR's scenarios, then runs its gate on what is in scope; returns the exit code. */
async function buildOneFr(run: FrRun, scenarios: Scenario[], all: Scenario[], passing: Set<string>, since: string): Promise<number> {
  const { worktree, record, out, retries, fr } = run;
  const builtRefusal = await buildScenarios(run, scenarios);
  if (builtRefusal !== undefined) return refuse(builtRefusal, out);
  // An attempt after the gate belongs to the FR's last scenario; its refusal's evidence and focus say what to fix.
  const last = scenarios[scenarios.length - 1]!;
  await record({ event: "stage", stage: "gate" });
  const { scope, leftOut } = gateScope(all, passing, run.green);
  await record({ event: "scope", fr, leftOut });
  const gate = await gateLoop(
    retries,
    () => runGate(worktree.dir, runCommand, { start: since, scenarios: scope }),
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

/**
 * An attempt the gate sent back. A code attempt is judged as any code attempt. A test or steps attempt is judged by
 * its boundary and its report only, with no new Red: its tests have theirs, and the gate runs again after it.
 */
function attemptAfterGate(run: FrRun, kind: AttemptKind, scenario: Scenario, refusal: Refusal): Promise<Tried> {
  if (kind === "code") return codeAttempt(run, scenario, refusal);
  return checkpointedAttempt(run, kind, scenario, refusal, async () => undefined);
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
}
