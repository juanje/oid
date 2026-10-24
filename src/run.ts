import { runCommand } from "./command.ts";
import { judgeNewTests } from "./evidence.ts";
import type { AttemptKind, Executor } from "./executor.ts";
import { gateRefusal, runGate } from "./gate.ts";
import { formatRefusal, type Refusal } from "./refusal.ts";
import { listScenarios } from "./scenarios.ts";
import { commitRun, createRunWorktree, takeAttemptChanges } from "./worktree.ts";

export interface RunOptions {
  projectDir: string;
  fr: string;
  executor: Executor;
  out: (text: string) => void;
}

const EXIT_BUILT = 0;
const EXIT_REFUSED = 1;

const ATTEMPTS: AttemptKind[] = ["steps", "test", "code"];

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
    const refusal = await runAttempts(executor, fr, scenario.name, worktreeDir);
    if (refusal !== undefined) return refusal;
  }
  return undefined;
}

/** Runs each attempt for one scenario in order and returns the first refusal, if any. */
async function runAttempts(executor: Executor, fr: string, scenario: string, worktreeDir: string): Promise<Refusal | undefined> {
  for (const kind of ATTEMPTS) {
    await executor.run({ kind, fr, scenario, worktree: worktreeDir });
    const changed = await takeAttemptChanges(worktreeDir);
    if (kind === "test") {
      const refusal = await judgeNewTests(worktreeDir, changed);
      if (refusal !== undefined) return refusal;
    }
  }
  return undefined;
}

function runId(fr: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `${fr}-${stamp}`;
}
