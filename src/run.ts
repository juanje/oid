import type { AttemptKind, Executor } from "./executor.ts";
import { commitRun, createRunWorktree } from "./worktree.ts";

export interface RunOptions {
  projectDir: string;
  fr: string;
  executor: Executor;
  out: (text: string) => void;
}

const ATTEMPTS: AttemptKind[] = ["steps", "test", "code"];

/** Builds one FR in its own worktree and commits it on the run's branch; returns the exit code. */
export async function runFr({ projectDir, fr, executor, out }: RunOptions): Promise<number> {
  const worktree = await createRunWorktree(projectDir, runId(fr));
  for (const kind of ATTEMPTS) {
    await executor.run({ kind, fr, worktree: worktree.dir });
  }
  await commitRun(worktree.dir, `feat(${fr}): built by oid run`);
  out(`${fr} built on branch ${worktree.branch}\n`);
  return 0;
}

function runId(fr: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `${fr}-${stamp}`;
}
