import { existsSync } from "node:fs";
import { join } from "node:path";
import { runAttempt } from "./attempt.ts";
import { isTestFile } from "./boundaries.ts";
import { runCommand } from "./command.ts";
import { readLimits } from "./config.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { type Judgment, judgeCode, judgeNewTests, judgeSteps } from "./evidence.ts";
import type { AttemptKind, Executor } from "./executor.ts";
import { EXIT_BUILT, EXIT_ERROR, EXIT_REFUSED } from "./exit.ts";
import { gateError, gateRefusal, runGate } from "./gate.ts";
import { innerLoop } from "./inner-loop.ts";
import { importedSymbolExists } from "./imported-symbols.ts";
import { formatRefusal, type Refusal } from "./refusal.ts";
import { withRetries } from "./retries.ts";
import { listScenarios, runScenarios, type ScenarioRun } from "./scenarios.ts";
import { runUnitTests, testsIn } from "./unit-tests.ts";
import { acceptedWork, commitRun, createRunWorktree } from "./worktree.ts";

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
  worktreeDir: string;
  out: (text: string) => void;
  /** The scenarios already built, which every code attempt must keep green. */
  green: Scenario[];
  /** The tests there are, so that a test attempt is judged on its new tests only. */
  known: Set<string>;
  /** How many times a refused attempt is retried. */
  retries: number;
}

/** Builds one FR in its own worktree and commits it on the run's branch; returns the exit code. */
export async function runFr({ projectDir, fr, executor, out }: RunOptions): Promise<number> {
  const worktree = await createRunWorktree(projectDir, runId(fr));
  const known = testsIn(await runUnitTests(worktree.dir, [], runCommand));
  const { retries } = await readLimits(worktree.dir);
  const run: FrRun = { executor, fr, worktreeDir: worktree.dir, out, green: [], known, retries };
  const scenarios = await listScenarios(worktree.dir, fr, runCommand);
  if (scenarios.length === 0) {
    return stop(`cucumber-js finds no scenario for ${fr}: check the project's cucumber-js configuration and the tag @${fr} on its feature file.`, out);
  }
  const builtRefusal = await buildScenarios(run, scenarios);
  if (builtRefusal !== undefined) return refuse(builtRefusal, out);
  const gate = await runGate(worktree.dir, runCommand);
  const error = gateError(gate);
  if (error !== undefined) return stop(error, out);
  const gateFailure = gateRefusal(gate);
  if (gateFailure !== undefined) return refuse(gateFailure, out);
  await commitRun(worktree.dir, `feat(${fr}): built by oid run`);
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
  const { executor, fr, worktreeDir, out, green, known, retries } = run;
  // An attempt and the judgment of its kind, retried from the work accepted before it while refused (FR-RUN-07).
  const judged = (kind: AttemptKind, judge: (files: string[]) => Promise<Refusal | undefined>) =>
    withRetries(retries, async (previous) => {
      const accepted = await acceptedWork(worktreeDir);
      const attempt = await runAttempt({ executor, kind, fr, scenario, worktreeDir, refusal: previous });
      return { refusal: attempt.refusal ?? (await judge(attempt.files)), rollback: accepted.restore };
    });
  const runScenario = async (): Promise<ScenarioRun> => (await runScenarios(worktreeDir, [scenario], runCommand))[0]!;
  // Asked at each judgment, of the file that failed: the project changes with every attempt.
  const symbolsOf = async (files: string[]): Promise<(name: string, file: string) => boolean> => {
    const present = files.filter((file) => existsSync(join(worktreeDir, file)));
    const checks = new Map(await Promise.all(present.map(async (file) => [file, await importedSymbolExists(worktreeDir, file)] as const)));
    return (name, file) => checks.get(file)?.(name) ?? true;
  };
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
      (await judged("code", async () => {
        const greenRuns = green.length === 0 ? [] : await runScenarios(worktreeDir, green, runCommand);
        const unit = await runUnitTests(worktreeDir, [], runCommand);
        for (const test of testsIn(unit)) known.add(test);
        return judgeCode(unit, greenRuns);
      })),
    async () => (await runScenario()).status === "passed",
  );
}

function runId(fr: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `${fr}-${stamp}`;
}
