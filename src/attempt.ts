import { judgeBoundary } from "./boundaries.ts";
import { runCommand } from "./command.ts";
import type { Scenario } from "./cucumber-messages.ts";
import type { AttemptKind, Executor, TryTarget } from "./executor.ts";
import type { Refusal } from "./refusal.ts";
import { judgeReport } from "./report.ts";
import { tryAttempt } from "./try.ts";
import { takeAttemptDiff } from "./worktree.ts";

export interface AttemptRequest {
  executor: Executor;
  kind: AttemptKind;
  fr: string;
  scenario: Scenario;
  worktreeDir: string;
}

/**
 * Runs one attempt with its tools, then judges what holds for every kind: it ended with a report (FR-AGENT-07),
 * and its diff stays inside its boundary (FR-AGENT-04). The evidence of its kind is judged after.
 */
export async function runAttempt({ executor, kind, fr, scenario, worktreeDir }: AttemptRequest): Promise<{ refusal: Refusal | undefined; files: string[] }> {
  let reported: string | undefined;
  const tools = {
    try: (target: TryTarget) => tryAttempt(worktreeDir, scenario, target, runCommand),
    report: (result: string) => {
      reported = result;
    },
  };
  await executor.run({ kind, fr, scenario: scenario.name, worktree: worktreeDir, tools });
  const diff = await takeAttemptDiff(worktreeDir);
  return { refusal: judgeReport(kind, scenario.name, reported) ?? judgeBoundary(kind, diff), files: diff.files };
}
