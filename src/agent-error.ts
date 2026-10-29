import type { AttemptKind, AttemptOutcome } from "./executor.ts";

// Errors that trying again does not clear: credentials, billing and quota (FR-AGENT-01), in the words providers use.
const LASTING = /\b(?:401|402|403)\b|unauthori[sz]ed|authenticat|api[ _-]?key|credential|permission|forbidden|billing|credit|quota|budget|payment|usage limit|extra usage/i;

/**
 * An attempt's agent stopped on an error no attempt can fix, such as a provider that keeps failing: the run stops with
 * exit 2. One that `passes` may be a provider's bad moment, and oid runs the attempt once more (FR-AGENT-01).
 */
export class AgentError extends Error {
  readonly kind: AttemptKind;
  readonly scenario: string;
  readonly outcome: AttemptOutcome;
  readonly passes: boolean;

  constructor(kind: AttemptKind, scenario: string, error: string, outcome: AttemptOutcome) {
    super(`The ${kind} attempt for "${scenario}" stopped on an error: ${error}. Check the provider and the model, then run oid again.`);
    this.kind = kind;
    this.scenario = scenario;
    this.outcome = outcome;
    this.passes = !LASTING.test(error);
  }
}

/** The error an attempt's executor reported, if any. */
export function agentError(kind: AttemptKind, scenario: string, outcome: AttemptOutcome): AgentError | undefined {
  return outcome.error === undefined ? undefined : new AgentError(kind, scenario, outcome.error, outcome);
}
