import type { AttemptKind } from "./executor.ts";
import { type Failing, withoutStack } from "./inner-loop.ts";
import type { Refusal } from "./refusal.ts";

// What a scenario's rounds say when they stop moving (FR-RUN-03) or reach their limit (FR-RUN-09). The agents' last
// reports go only to the person, at the end: routing a report to another attempt kind is FR-RUN-04's.

/**
 * The refusal of rounds with no progress: given to the next round's test attempt, and, with the last report of each
 * attempt kind, the one the run stops with.
 */
export function stalledRefusal(scenario: string, failing: Failing, reports?: ReadonlyMap<AttemptKind, string>): Refusal {
  const failure = `step "${failing.step}": ${withoutStack(failing.message)}`;
  return {
    failed: `The round made no progress: ${scenario} still fails at step "${failing.step}"`,
    evidence: reports === undefined ? failure : `${failure}\n${lastReports(reports)}`,
    next:
      reports === undefined
        ? "oid needs a round that moves this failure on: a new unit test that fails for what the scenario still lacks, and the code that makes it pass"
        : "Read the attempts' last reports: they may see a cause outside what test and code attempts can change",
  };
}

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
