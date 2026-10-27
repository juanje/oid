import { ownerOf } from "./boundaries.ts";
import type { PathsKind } from "./executor.ts";
import { type CheckResult, gateError, gateRefusal } from "./gate.ts";
import type { Refusal } from "./refusal.ts";
import { type Tried, withRetries } from "./retries.ts";

export type GateOutcome = { error: string } | { refusal: Refusal | undefined };

const KEEP_THE_CODE = async (): Promise<void> => {};

// Outside-in: the attempt the gate sends back first, when failures belong to several kinds.
const OUTSIDE_IN: PathsKind[] = ["steps", "test", "code"];

/**
 * Runs the gate before the FR's commit (FR-GATE-04). A failure goes back to the attempt kind that can fix it, with
 * the gate's refusal and its focus, and the gate runs again, up to `retries`: a type error to the owner of its file,
 * failing tests and scenarios to a code attempt, one kind at a time, outside-in. That attempt starts from the code the
 * gate refused, to fix it, and must not leave fewer tests than the gate ran before it. An option a runner does not
 * know is an error.
 */
export async function gateLoop(
  retries: number,
  gate: () => Promise<CheckResult[]>,
  afterGate: (kind: PathsKind, refusal: Refusal) => Promise<Tried>,
  onGate: (refusal: Refusal | undefined, sendTo: PathsKind | undefined) => Promise<void> = async () => {},
  owner: (file: string) => PathsKind = (file) => ownerOf(file),
): Promise<GateOutcome> {
  let error: string | undefined;
  let kind: PathsKind = "code";
  let tests: number | undefined;
  const refusal = await withRetries(retries, async (previous): Promise<Tried> => {
    if (previous !== undefined) {
      const attempt = await afterGate(kind, previous);
      if (attempt.refusal !== undefined) return attempt;
    }
    const results = await gate();
    error = gateError(results);
    if (error !== undefined) return { refusal: undefined, rollback: KEEP_THE_CODE };
    const ran = results.find((result) => result.name === "unit")?.tests;
    // The same kind goes back: it is the one that dropped them.
    if (tests !== undefined && ran !== undefined && ran < tests) {
      const fewer = fewerTests(tests, ran);
      await onGate(fewer, kind);
      return { refusal: fewer, rollback: KEEP_THE_CODE };
    }
    tests = ran ?? tests;
    const sendTo = ownerOfFailures(results, owner);
    if (sendTo !== undefined) kind = sendTo;
    const refusal = gateRefusal(results, sendTo);
    await onGate(refusal, refusal === undefined ? undefined : sendTo);
    return { refusal, rollback: KEEP_THE_CODE, final: sendTo === undefined };
  });
  return error === undefined ? { refusal } : { error };
}

/** The kind the gate's failures go back to, outside-in, or none when a failure is not one an attempt can be sent to fix. */
function ownerOfFailures(results: CheckResult[], owner: (file: string) => PathsKind): PathsKind | undefined {
  const failed = results.filter((result) => !result.passed);
  const kinds = failed.map((result) => {
    // A branch no test runs is code no test asks for: a code attempt removes it (FR-GATE-02).
    if (result.name === "unit" || result.name === "scenarios" || result.name === "coverage") return ["code" as const];
    if (result.name === "types" && (result.failedFiles?.length ?? 0) > 0) return result.failedFiles!.map(owner);
    return undefined;
  });
  if (kinds.includes(undefined)) return undefined;
  const owners = new Set(kinds.flat());
  return OUTSIDE_IN.find((candidate) => owners.has(candidate));
}

function fewerTests(before: number, now: number): Refusal {
  return {
    from: "gate",
    failed: "The attempt after the gate left fewer tests",
    evidence: `The gate ran ${before} unit tests before this attempt, and ${now} after it`,
    next: "Fix the error without removing tests",
  };
}
