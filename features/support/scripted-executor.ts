import { cp } from "node:fs/promises";
import type { AttemptKind, Executor } from "../../src/executor.ts";

/** An executor that lands each attempt kind's prepared files in the worktree, the way an agent's diff would. */
export function scriptedExecutor(projectDir: string, attempts: Partial<Record<AttemptKind, string>>): Executor {
  return {
    async run(attempt) {
      // The reply checks the request it answers: an attempt works in the run's worktree, never in the person's copy.
      if (attempt.worktree === projectDir) throw new Error(`The ${attempt.kind} attempt was sent to the person's working copy`);
      const files = attempts[attempt.kind];
      if (files === undefined) throw new Error(`No scripted ${attempt.kind} attempt`);
      await cp(files, attempt.worktree, { recursive: true });
      return { result: `scripted ${attempt.kind} attempt` };
    },
  };
}
