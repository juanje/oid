import type { AttemptKind, AttemptOutcome } from "./executor.ts";

/** Whether an attempt reached its turn limit: its executor ended it there, or reports more turns, so did not respect it. */
export function turnLimitReached(outcome: AttemptOutcome, limit: number): boolean {
  return outcome.stoppedAtLimit || outcome.turns > limit;
}

/** A limit ends the run at the work accepted so far (FR-RUN-09); no attempt is retried after it. */
export class LimitReached extends Error {
  constructor(kind: AttemptKind, scenario: string, turns: number) {
    super(`Stopped at the turn limit: the ${kind} attempt for "${scenario}" reached its ${turns} turns. Raise limits.turns in .oid.json, or look at what the attempt was doing.`);
  }
}
