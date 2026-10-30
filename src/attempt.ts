import { agentError } from "./agent-error.ts";
import { type Layout, judgeBoundary } from "./boundaries.ts";
import type { CommandRunner } from "./command.ts";
import type { Scenario } from "./cucumber-messages.ts";
import type { Attempt, AttemptKind, AttemptOutcome, Executor, Mutant, NextAttempt, TaskContext, TryTarget, Unasked } from "./executor.ts";
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
  /** Where the project keeps each kind of file (FR-AGENT-04). */
  layout: Layout;
  /** The refusal of the attempt before it, when this one is a retry. */
  refusal: Refusal | undefined;
  /** The turns its agent may take. */
  turns: number;
  /** The tokens of output one of its turns may take (FR-RUN-09). */
  outputTokens: number;
  /** What its task gives besides its kind and scenario. */
  context?: TaskContext;
  /** Where its agent's session is kept. */
  transcript?: string;
  /** For an attempt another one asked for: which kind asked, and why (FR-RUN-04). */
  asked?: Attempt["asked"];
  /** How `try` runs its check: within the run's time limit (FR-RUN-09). */
  check: CommandRunner;
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
  layout,
  refusal: previous,
  turns,
  outputTokens,
  context,
  transcript,
  asked,
  check,
}: AttemptRequest): Promise<{ refusal: Refusal | undefined; files: string[]; outcome: AttemptOutcome; report?: string; next?: NextAttempt; mutant?: Mutant; note?: string; unasked?: Unasked[] }> {
  let reported: string | undefined;
  let next: NextAttempt | undefined;
  let mutant: Mutant | undefined;
  let note: string | undefined;
  let unasked: Unasked[] | undefined;
  const tools = {
    try: (target: TryTarget) => tryAttempt(worktreeDir, scenario, target, check),
    report: (result: string, asks?: NextAttempt, submits?: Mutant, notes?: string, names?: Unasked[]) => {
      reported = result;
      next = asks;
      mutant = submits;
      note = notes;
      unasked = names;
    },
  };
  const outcome = await executor.run({
    kind,
    fr,
    scenario: scenario.name,
    worktree: worktreeDir,
    layout,
    tools,
    limits: { turns, outputTokens },
    ...(previous === undefined ? {} : { refusal: previous }),
    ...(context === undefined ? {} : { context }),
    ...(transcript === undefined ? {} : { transcript }),
    ...(asked === undefined ? {} : { asked }),
  });
  const error = agentError(kind, scenario.name, outcome);
  if (error !== undefined) throw error;
  if (turnLimitReached(outcome, turns)) throw new LimitReached(kind, scenario.name, turns, outcome);
  const diff = await takeAttemptDiff(worktreeDir);
  const refusal = judgeReport(kind, scenario.name, reported) ?? judgeBoundary(kind, diff, layout);
  return { refusal, files: diff.files, outcome, ...(reported === undefined ? {} : { report: reported }), ...(next === undefined ? {} : { next }), ...(mutant === undefined ? {} : { mutant }), ...(note === undefined ? {} : { note }), ...(unasked === undefined ? {} : { unasked }) };
}
