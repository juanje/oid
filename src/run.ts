import { judgeNewTests } from "./evidence.ts";
import type { AttemptKind, Executor } from "./executor.ts";
import { formatRefusal, type Refusal } from "./refusal.ts";
import { commitRun, createRunWorktree, takeAttemptChanges } from "./worktree.ts";

export interface RunOptions {
  projectDir: string;
  fr: string;
  executor: Executor;
  out: (text: string) => void;
}

export const EXIT_BUILT = 0;
export const EXIT_REFUSED = 1;

const ATTEMPTS: AttemptKind[] = ["steps", "test", "code"];

/** Builds one FR in its own worktree and commits it on the run's branch; returns the exit code. */
export async function runFr({ projectDir, fr, executor, out }: RunOptions): Promise<number> {
  const worktree = await createRunWorktree(projectDir, runId(fr));
  for (const kind of ATTEMPTS) {
    await executor.run({ kind, fr, worktree: worktree.dir });
    const changed = await takeAttemptChanges(worktree.dir);
    const refusal = await judgeAttempt(kind, worktree.dir, changed);
    if (refusal !== undefined) {
      out(formatRefusal(refusal));
      return EXIT_REFUSED;
    }
  }
  await commitRun(worktree.dir, `feat(${fr}): built by oid run`);
  out(`${fr} built on branch ${worktree.branch}\n`);
  return EXIT_BUILT;
}

async function judgeAttempt(kind: AttemptKind, worktreeDir: string, changed: string[]): Promise<Refusal | undefined> {
  if (kind === "test") return judgeNewTests(worktreeDir, changed);
  return undefined;
}

function runId(fr: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `${fr}-${stamp}`;
}
