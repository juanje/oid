import type { Scenario } from "./cucumber-messages.ts";

/** oid's answer to an attempt it does not accept (NFR-01). */
export interface Refusal {
  failed: string;
  evidence: string;
  next: string;
  /**
   * What the next attempt must look at first, when it is not the scenario that attempt belongs to: the scenarios and
   * tests the gate found failing (FR-GATE-04). The task puts them in focus (FR-AGENT-03).
   */
  focus?: { scenarios: Scenario[]; tests: string[] };
}

export function formatRefusal(refusal: Refusal): string {
  return `Refused: ${refusal.failed}\nEvidence:\n${refusal.evidence}\nNext: ${refusal.next}\n`;
}
