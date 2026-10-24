import { agentError } from "./agent-error.ts";
import { judgeBoundary } from "./boundaries.ts";
import { runCommand } from "./command.ts";
import type { Scenario } from "./cucumber-messages.ts";
import type { AttemptKind, AttemptOutcome, Executor, TaskContext, TryTarget } from "./executor.ts";
import { LimitReached, turnLimitReached } from "./limits.ts";
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
  /** The refusal of the attempt before it, when this one is a retry. */
  refusal: Refusal | undefined;
  /** The turns its agent may take. */
  turns: number;
  /** What its task gives besides its kind and scenario. */
  context?: TaskContext;
  /** Where its agent's session is kept. */
  transcript?: string;
}

/**
 * Runs one attempt with its tools, then judges what holds for every kind: it stayed within its turns (FR-RUN-09),
 * ended with a report (FR-AGENT-07), and its diff stays inside its boundary (FR-AGENT-04). The evidence of its kind
 * is judged after. An error its executor reports throws AgentError, and a reached limit LimitReached: each ends the
 * run, and no retry follows.
 */
export async function runAttempt({
  executor,
  kind,
  fr,
  scenario,
  worktreeDir,
  refusal: previous,
  turns,
  context,
  transcript,
}: AttemptRequest): Promise<{ refusal: Refusal | undefined; files: string[]; outcome: AttemptOutcome }> {
  let reported: string | undefined;
  const tools = {
    try: (target: TryTarget) => tryAttempt(worktreeDir, scenario, target, runCommand),
    report: (result: string) => {
      reported = result;
    },
  };
  const outcome = await executor.run({
    kind,
    fr,
    scenario: scenario.name,
    worktree: worktreeDir,
    tools,
    limits: { turns },
    ...(previous === undefined ? {} : { refusal: previous }),
    ...(context === undefined ? {} : { context }),
    ...(transcript === undefined ? {} : { transcript }),
  });
  const error = agentError(kind, scenario.name, outcome);
  if (error !== undefined) throw error;
  if (turnLimitReached(outcome, turns)) throw new LimitReached(kind, scenario.name, turns, outcome);
  const diff = await takeAttemptDiff(worktreeDir);
  return { refusal: judgeReport(kind, scenario.name, reported) ?? judgeBoundary(kind, diff), files: diff.files, outcome };
}
