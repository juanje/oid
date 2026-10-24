import { runCommand } from "./command.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { type Judgment, judgeCode, judgeNewTests, judgeSteps } from "./evidence.ts";
import type { AttemptKind, Executor } from "./executor.ts";
import { gateRefusal, runGate } from "./gate.ts";
import { innerLoop } from "./inner-loop.ts";
import { projectSymbols } from "./project-symbols.ts";
import { formatRefusal, type Refusal } from "./refusal.ts";
import { listScenarios, runScenarios, type ScenarioRun } from "./scenarios.ts";
import { runUnitTests, testsIn } from "./unit-tests.ts";
import { commitRun, createRunWorktree, takeAttemptChanges } from "./worktree.ts";

export interface RunOptions {
  projectDir: string;
  fr: string;
  executor: Executor;
  out: (text: string) => void;
}

const EXIT_BUILT = 0;
const EXIT_REFUSED = 1;

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
}

/** Builds one FR in its own worktree and commits it on the run's branch; returns the exit code. */
export async function runFr({ projectDir, fr, executor, out }: RunOptions): Promise<number> {
  const worktree = await createRunWorktree(projectDir, runId(fr));
  const known = testsIn(await runUnitTests(worktree.dir, [], runCommand));
  const run: FrRun = { executor, fr, worktreeDir: worktree.dir, out, green: [], known };
  const refusal = (await buildScenarios(run)) ?? gateRefusal(await runGate(worktree.dir, runCommand));
  if (refusal !== undefined) {
    out(formatRefusal(refusal));
    return EXIT_REFUSED;
  }
  await commitRun(worktree.dir, `feat(${fr}): built by oid run`);
  out(`${fr} built on branch ${worktree.branch}\n`);
  return EXIT_BUILT;
}

/** Builds the FR's scenarios one at a time, in file order, and returns the first refusal, if any. */
async function buildScenarios(run: FrRun): Promise<Refusal | undefined> {
  for (const scenario of await listScenarios(run.worktreeDir, run.fr, runCommand)) {
    const refusal = await buildScenario(run, scenario);
    if (refusal !== undefined) return refusal;
    run.green.push(scenario);
  }
  return undefined;
}

/** Builds one scenario: its step definitions, Red first, then rounds of test and code until it passes, keeping the green ones green. */
async function buildScenario(run: FrRun, scenario: Scenario): Promise<Refusal | undefined> {
  const { executor, fr, worktreeDir, out, green, known } = run;
  const attempt = async (kind: AttemptKind): Promise<string[]> => {
    await executor.run({ kind, fr, scenario: scenario.name, worktree: worktreeDir });
    return takeAttemptChanges(worktreeDir);
  };
  const runScenario = async (): Promise<ScenarioRun> => (await runScenarios(worktreeDir, [scenario], runCommand))[0]!;
  // Asked at each judgment: the project changes with every attempt.
  const symbolExists = async (): Promise<(name: string) => boolean> => {
    const symbols = await projectSymbols(worktreeDir);
    return (name) => symbols.has(name);
  };
  const accept = ({ refusal, reds }: Judgment): Refusal | undefined => {
    for (const red of reds) out(`Red: ${red}\n`);
    return refusal;
  };

  await attempt("steps");
  const stepsRefusal = accept(judgeSteps(await runScenario(), await symbolExists()));
  if (stepsRefusal !== undefined) return stepsRefusal;
  return innerLoop(
    async () => {
      const testRefusal = accept(await judgeNewTests(worktreeDir, await attempt("test"), runCommand, await symbolExists(), known));
      if (testRefusal !== undefined) return testRefusal;
      await attempt("code");
      const greenRuns = green.length === 0 ? [] : await runScenarios(worktreeDir, green, runCommand);
      const unit = await runUnitTests(worktreeDir, [], runCommand);
      for (const test of testsIn(unit)) known.add(test);
      return judgeCode(unit, greenRuns);
    },
    async () => (await runScenario()).status === "passed",
  );
}

function runId(fr: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `${fr}-${stamp}`;
}
