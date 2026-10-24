import type { AttemptKind, AttemptOutcome } from "./executor.ts";

/** An attempt's agent stopped on an error no attempt can fix, such as a provider that keeps failing: the run stops with exit 2, and no retry follows. */
export class AgentError extends Error {
  readonly kind: AttemptKind;
  readonly scenario: string;
  readonly outcome: AttemptOutcome;

  constructor(kind: AttemptKind, scenario: string, error: string, outcome: AttemptOutcome) {
    super(`The ${kind} attempt for "${scenario}" stopped on an error: ${error}. Check the provider and the model, then run oid again.`);
    this.kind = kind;
    this.scenario = scenario;
    this.outcome = outcome;
  }
}

/** The error an attempt's executor reported, if any. */
export function agentError(kind: AttemptKind, scenario: string, outcome: AttemptOutcome): AgentError | undefined {
  return outcome.error === undefined ? undefined : new AgentError(kind, scenario, outcome.error, outcome);
}
