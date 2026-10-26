import { WRITABLE } from "./boundaries.ts";
import type { Refusal } from "./refusal.ts";

// Provisional Reds (FR-EVID-01, D-02): a failure oid cannot classify is accepted, the code confirms it by making it
// pass, and it is refuted only when the code attempts run out with it still failing.

/** The provisional Reds not yet confirmed: unit tests, and the scenario's. */
export interface Pending {
  tests: string[];
  scenario?: string;
}

export type Settlement = { repair: string[] } | { refuted: string[] } | undefined;

/**
 * What the run does when the code attempts run out. `unsatisfied` are the unit tests still failing when the last code
 * attempt was refused for them; undefined when it was refused for another reason, and then nothing is refuted. A
 * provisional test gets one repair per run; one still failing after it is refuted, and so is a provisional scenario.
 */
export function whenCodeRunsOut(pending: Pending, repaired: Set<string>, unsatisfied: string[] | undefined): Settlement {
  if (unsatisfied === undefined) return undefined;
  const failing = pending.tests.filter((test) => unsatisfied.includes(test));
  const again = failing.filter((test) => repaired.has(test));
  if (again.length > 0) return { refuted: again };
  if (failing.length > 0) return { repair: failing };
  return pending.scenario === undefined ? undefined : { refuted: [pending.scenario] };
}

/** The refusal of provisional Reds the code never satisfied: for tests, it goes back to a test attempt. */
export function refutedRefusal(what: "tests" | "scenario", evidence: string[], sourcePaths: string[] = WRITABLE.code): Refusal {
  const source = sourcePaths.join(", ");
  if (what === "scenario") {
    return {
      failed: "A provisional Red was refuted: no code attempt made this scenario pass",
      evidence: evidence.join("\n"),
      next: `oid needs step definitions that check the same behaviour and that code in ${source} can make pass`,
    };
  }
  return {
    failed: "A provisional Red was refuted: no code attempt made these tests pass",
    evidence: evidence.join("\n"),
    next: `oid needs a test that checks the same behaviour and that code in ${source} can make pass`,
    sendTo: "test",
  };
}
