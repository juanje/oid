import { runCommand } from "./command.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { judgeCode, judgeNewTests, judgeSteps } from "./evidence.ts";
import type { AttemptKind, Executor } from "./executor.ts";
import { gateRefusal, runGate } from "./gate.ts";
import { formatRefusal, type Refusal } from "./refusal.ts";
import { innerLoop } from "./inner-loop.ts";
import { listScenarios, runScenarios, type ScenarioRun } from "./scenarios.ts";
import { runUnitTests } from "./unit-tests.ts";
import { commitRun, createRunWorktree, takeAttemptChanges } from "./worktree.ts";

export interface RunOptions {
  projectDir: string;
  fr: string;
  executor: Executor;
  out: (text: string) => void;
}

const EXIT_BUILT = 0;
const EXIT_REFUSED = 1;

/** Builds one FR in its own worktree and commits it on the run's branch; returns the exit code. */
export async function runFr({ projectDir, fr, executor, out }: RunOptions): Promise<number> {
  const worktree = await createRunWorktree(projectDir, runId(fr));
  const refusal = (await buildScenarios(executor, fr, worktree.dir)) ?? gateRefusal(await runGate(worktree.dir, runCommand));
  if (refusal !== undefined) {
    out(formatRefusal(refusal));
    return EXIT_REFUSED;
  }
  await commitRun(worktree.dir, `feat(${fr}): built by oid run`);
  out(`${fr} built on branch ${worktree.branch}\n`);
  return EXIT_BUILT;
}

/** Builds the FR's scenarios one at a time, in file order, and returns the first refusal, if any. */
async function buildScenarios(executor: Executor, fr: string, worktreeDir: string): Promise<Refusal | undefined> {
  for (const scenario of await listScenarios(worktreeDir, fr, runCommand)) {
    const refusal = await buildScenario(executor, fr, scenario, worktreeDir);
    if (refusal !== undefined) return refusal;
  }
  return undefined;
}

/** Builds one scenario: its step definitions, Red first, then rounds of test and code until it passes. */
async function buildScenario(executor: Executor, fr: string, scenario: Scenario, worktreeDir: string): Promise<Refusal | undefined> {
  const attempt = async (kind: AttemptKind): Promise<string[]> => {
    await executor.run({ kind, fr, scenario: scenario.name, worktree: worktreeDir });
    return takeAttemptChanges(worktreeDir);
  };
  const runScenario = async (): Promise<ScenarioRun> => (await runScenarios(worktreeDir, [scenario], runCommand))[0]!;

  await attempt("steps");
  const stepsRefusal = judgeSteps(await runScenario());
  if (stepsRefusal !== undefined) return stepsRefusal;
  return innerLoop(
    async () => {
      const testRefusal = await judgeNewTests(worktreeDir, await attempt("test"));
      if (testRefusal !== undefined) return testRefusal;
      await attempt("code");
      return judgeCode(await runUnitTests(worktreeDir, [], runCommand), []);
    },
    async () => (await runScenario()).status === "passed",
  );
}

function runId(fr: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `${fr}-${stamp}`;
}
