import type { AttemptKind, AttemptOutcome } from "./executor.ts";

/** Whether an attempt reached its turn limit: its executor ended it there, or reports more turns, so did not respect it. */
export function turnLimitReached(outcome: AttemptOutcome, limit: number): boolean {
  return outcome.stoppedAtLimit || outcome.turns > limit;
}

/** A limit ends the run at the work accepted so far (FR-RUN-09); no attempt is retried after it. */
export class LimitReached extends Error {
  readonly kind: AttemptKind;
  readonly scenario: string;
  readonly outcome: AttemptOutcome;

  constructor(kind: AttemptKind, scenario: string, turns: number, outcome: AttemptOutcome) {
    super(`Stopped at the turn limit: the ${kind} attempt for "${scenario}" reached its ${turns} turns. Raise limits.turns in .oid.json, or look at what the attempt was doing.`);
    this.kind = kind;
    this.scenario = scenario;
    this.outcome = outcome;
  }
}

/** A scenario reached its limit of rounds (FR-RUN-09): the run ends at the work accepted so far. */
export class RoundLimitReached extends Error {
  readonly scenario: string;

  constructor(message: string, scenario: string) {
    super(message);
    this.scenario = scenario;
  }
}
