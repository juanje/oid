import type { AttemptKind } from "./executor.ts";
import { type Failing, withoutStack } from "./inner-loop.ts";

// What the run says when a scenario reaches its limit of rounds (FR-RUN-09). The agents' last reports go only to the
// person, at the end: routing a report to another attempt kind is FR-RUN-04's.

/** What the run says when a scenario reaches its limit of rounds. */
export function roundLimitMessage(scenario: string, rounds: number, failing: Failing, reports: ReadonlyMap<AttemptKind, string>): string {
  return [
    `Stopped at the round limit: ${scenario} reached its ${rounds} rounds and still fails at step "${failing.step}": ${withoutStack(failing.message)}`,
    "Raise limits.rounds in .oid.json, or read the attempts' last reports.",
    lastReports(reports),
  ].join("\n");
}

function lastReports(reports: ReadonlyMap<AttemptKind, string>): string {
  return ["The last report of each attempt kind:", ...[...reports].map(([kind, report]) => `  ${kind}: ${report}`)].join("\n");
}
