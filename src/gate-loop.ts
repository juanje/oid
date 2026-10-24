import { type CheckResult, gateError, gateRefusal } from "./gate.ts";
import type { Refusal } from "./refusal.ts";
import { type Tried, withRetries } from "./retries.ts";

export type GateOutcome = { error: string } | { refusal: Refusal | undefined };

const KEEP_THE_CODE = async (): Promise<void> => {};

/**
 * Runs the gate before the FR's commit. Failing tests and scenarios go back to a code attempt, with the gate's
 * refusal and its focus, and the gate runs again, up to `retries` (FR-GATE-04). That code attempt starts from the
 * code the gate refused, to fix it. In the skeleton any other failure ends the run as a refusal; an option a runner
 * does not know is an error.
 */
export async function gateLoop(
  retries: number,
  gate: () => Promise<CheckResult[]>,
  codeAfterGate: (refusal: Refusal) => Promise<Tried>,
): Promise<GateOutcome> {
  let error: string | undefined;
  const refusal = await withRetries(retries, async (previous): Promise<Tried> => {
    if (previous !== undefined) {
      const code = await codeAfterGate(previous);
      if (code.refusal !== undefined) return code;
    }
    const results = await gate();
    error = gateError(results);
    if (error !== undefined) return { refusal: undefined, rollback: KEEP_THE_CODE };
    const sentBack = results.every((result) => result.passed || result.name === "unit" || result.name === "scenarios");
    return { refusal: gateRefusal(results), rollback: KEEP_THE_CODE, final: !sentBack };
  });
  return error === undefined ? { refusal } : { error };
}
