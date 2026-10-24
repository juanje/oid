import { appendFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AttemptKind } from "./executor.ts";
import { git } from "./git.ts";
import type { Refusal } from "./refusal.ts";

// The run log (FR-STATE-02): append-only, one JSON event per line, in the repository's .git/oid/runs. Everything in it
// is computed by oid; what an agent says of itself never reaches it.

export interface AttemptEvent {
  event: "attempt";
  kind: AttemptKind;
  scenario: string;
  verdict: "accepted" | "refused" | "stopped at the turn limit";
  /** The attempt came with the refusal of the one before it. */
  retry: boolean;
  refusal?: Refusal;
  /** As the executor reported them. */
  turns: number;
  model?: string;
  tokens?: number;
  cost?: number;
  deniedToolCalls?: number;
}

export interface StopEvent {
  event: "stop";
  limit: "turns";
}

export interface Measures {
  attempts: Partial<Record<AttemptKind, number>>;
  rejections: Partial<Record<AttemptKind, number>>;
  /** Retries refused with the same failure and evidence as the attempt before them. */
  blindRetries: number;
  tokens: number;
  cost: number;
  deniedToolCalls: number;
  /** The run's time, on a monotonic clock, so that a suspended machine does not count. */
  timeMs: number;
}

export interface EndEvent {
  event: "end";
  exitCode: number;
  measures: Measures;
}

export type LogEvent = AttemptEvent | StopEvent | EndEvent;

export interface RunLog {
  append(event: LogEvent): Promise<void>;
}

/** The log of run `runId`, in the repository's .git/oid/runs, whichever of its worktrees `dir` is in. */
export async function openRunLog(dir: string, runId: string): Promise<RunLog> {
  const runs = join(resolve(dir, await git(dir, "rev-parse", "--git-common-dir")), "oid", "runs");
  await mkdir(runs, { recursive: true });
  const path = join(runs, `${runId}.jsonl`);
  return { append: (event) => appendFile(path, `${JSON.stringify(event)}\n`) };
}

/** The run's measures, from its attempt events, and its time. */
export function measuresOf(events: LogEvent[], timeMs: number): Measures {
  const attempts = events.filter((event): event is AttemptEvent => event.event === "attempt");
  const measures: Measures = { attempts: {}, rejections: {}, blindRetries: 0, tokens: 0, cost: 0, deniedToolCalls: 0, timeMs };
  const last = new Map<AttemptKind, AttemptEvent>();
  for (const attempt of attempts) {
    measures.attempts[attempt.kind] = (measures.attempts[attempt.kind] ?? 0) + 1;
    if (attempt.verdict === "refused") measures.rejections[attempt.kind] = (measures.rejections[attempt.kind] ?? 0) + 1;
    const before = last.get(attempt.kind)?.refusal;
    if (attempt.retry && attempt.refusal !== undefined && before !== undefined && sameFailure(attempt.refusal, before)) measures.blindRetries += 1;
    measures.tokens += attempt.tokens ?? 0;
    measures.cost += attempt.cost ?? 0;
    measures.deniedToolCalls += attempt.deniedToolCalls ?? 0;
    last.set(attempt.kind, attempt);
  }
  return measures;
}

function sameFailure(one: Refusal, other: Refusal): boolean {
  return one.failed === other.failed && one.evidence === other.evidence;
}
