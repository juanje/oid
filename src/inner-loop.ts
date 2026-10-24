import type { Refusal } from "./refusal.ts";

/**
 * Runs rounds of test and code attempts while the scenario fails, and returns the first refusal, if any.
 * It runs at least one round: a scenario only gets here after failing with its new step definitions.
 */
export async function innerLoop(
  round: () => Promise<Refusal | undefined>,
  scenarioPasses: () => Promise<boolean>,
): Promise<Refusal | undefined> {
  do {
    const refusal = await round();
    if (refusal !== undefined) return refusal;
  } while (!(await scenarioPasses()));
  return undefined;
}
