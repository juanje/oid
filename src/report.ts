import type { AttemptKind } from "./executor.ts";
import type { Refusal } from "./refusal.ts";

/** Refuses an attempt that ended without reporting its result (FR-AGENT-07): oid acts on the report, not on free text. */
export function judgeReport(kind: AttemptKind, scenario: string, result: string | undefined): Refusal | undefined {
  if (result !== undefined && result.trim() !== "") return undefined;
  return {
    failed: result === undefined ? "The attempt ended without a report" : "The attempt's report gives no result",
    evidence: `The ${kind} attempt for "${scenario}"`,
    next: "End every attempt with report, giving its result in a few words",
  };
}
