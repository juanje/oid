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
 * failing tests and scenarios to a code attempt, one kind at a time, outside-in. An uncovered branch goes to a test
 * attempt first, and to a code attempt once a test attempt has had it, with that attempt's report (FR-GATE-02). That
 * attempt starts from the code the gate refused, to fix it, and must not leave fewer tests than the gate ran before
 * it. An option a runner does not know is an error.
 */
export async function gateLoop(
  retries: number,
  gate: () => Promise<CheckResult[]>,
  afterGate: (kind: PathsKind, refusal: Refusal) => Promise<Tried & { report?: string }>,
  onGate: (refusal: Refusal | undefined, sendTo: PathsKind | undefined) => Promise<void> = async () => {},
  owner: (file: string) => PathsKind = (file) => ownerOf(file),
): Promise<GateOutcome> {
  let error: string | undefined;
  let kind: PathsKind = "code";
  let tests: number | undefined;
  // Once a test attempt has had the uncovered branches, they go to a code attempt, with what it reported.
  let coverTried = false;
  let coverReport: string | undefined;
  /** One run of the gate, judged: an error, fewer tests than before, or the refusal for the kind it goes back to. */
  const judged = async (): Promise<Tried> => {
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
    const sendTo = ownerOfFailures(results, owner, coverTried ? "code" : "test");
    if (sendTo !== undefined) kind = sendTo;
    const refusal = withCoverReport(gateRefusal(results, sendTo), sendTo, coverReport);
    await onGate(refusal, refusal === undefined ? undefined : sendTo);
    return { refusal, rollback: KEEP_THE_CODE, final: sendTo === undefined };
  };
  const refusal = await withRetries(retries, async (previous): Promise<Tried> => {
    if (previous !== undefined) {
      const attempt = await afterGate(kind, previous);
      if (attempt.refusal !== undefined) return attempt;
    }
    const tried = await judged();
    // The test attempt for uncovered branches has retries of its own: it is not one of the gate's (FR-GATE-02).
    if (kind !== "test" || tried.refusal?.uncovered === undefined || coverTried) return tried;
    coverTried = true;
    coverReport = (await afterGate("test", tried.refusal)).report;
    return judged();
  });
  return error === undefined ? { refusal } : { error };
}

/**
 * The kind the gate's failures go back to, outside-in, or none when a failure is not one an attempt can be sent to fix.
 * Uncovered branches go to `cover`, unless tests or scenarios fail too: the code goes first then, since what the tests
 * cover is not yet what it will be.
 */
function ownerOfFailures(results: CheckResult[], owner: (file: string) => PathsKind, cover: PathsKind): PathsKind | undefined {
  const failed = results.filter((result) => !result.passed);
  const codeFails = failed.some((result) => result.name === "unit" || result.name === "scenarios");
  const kinds = failed.map((result) => {
    if (result.name === "coverage") return [codeFails ? ("code" as const) : cover];
    if (result.name === "unit" || result.name === "scenarios") return ["code" as const];
    if (result.name === "types" && (result.failedFiles?.length ?? 0) > 0) return result.failedFiles!.map(owner);
    return undefined;
  });
  if (kinds.includes(undefined)) return undefined;
  const owners = new Set(kinds.flat());
  return OUTSIDE_IN.find((candidate) => owners.has(candidate));
}

/** A refusal sent to a code attempt for uncovered branches, with what the test attempt that had them reported. */
function withCoverReport(refusal: Refusal | undefined, sendTo: PathsKind | undefined, report: string | undefined): Refusal | undefined {
  if (refusal?.uncovered === undefined || sendTo !== "code" || report === undefined) return refusal;
  return { ...refusal, evidence: `${refusal.evidence}\nThe test attempt that had these branches reported:\n${report}` };
}

function fewerTests(before: number, now: number): Refusal {
  return {
    from: "gate",
    failed: "The attempt after the gate left fewer tests",
    evidence: `The gate ran ${before} unit tests before this attempt, and ${now} after it`,
    next: "Fix the error without removing tests",
  };
}
