import type { Scenario, StepFailure } from "./cucumber-messages.ts";
import type { AttemptKind } from "./executor.ts";

/** A scenario the gate found failing, with its steps and where it fails, when the gate has them. */
export interface FocusScenario extends Scenario {
  steps?: string[];
  failure?: StepFailure;
}

/** oid's answer to an attempt it does not accept (NFR-01). */
export interface Refusal {
  failed: string;
  evidence: string;
  next: string;
  /**
   * What the next attempt must look at first, when it is not the scenario that attempt belongs to: the scenarios and
   * tests the gate found failing (FR-GATE-04). The task puts them in focus (FR-AGENT-03).
   */
  focus?: { scenarios: FocusScenario[]; tests: string[] };
  /** The kind of attempt that can act on it, when it is not the kind refused: a test file the code cannot fix goes to a test attempt. */
  sendTo?: AttemptKind;
  /** The gate's, not the refused attempt's own: the task of the attempt it goes back to opens with its job (FR-AGENT-03). */
  from?: "gate";
  /** The refused attempt's diff, which oid took back: a cleanup's retry gets it to finish what it started (FR-REF-02). */
  diff?: string;
}

export function formatRefusal(refusal: Refusal): string {
  return `Refused: ${refusal.failed}\nEvidence:\n${refusal.evidence}\nNext: ${refusal.next}\n`;
}
