import type { Refusal } from "./refusal.ts";

/** How the scenario fails: the step, and the failure's message. */
export interface Failing {
  step: string;
  message: string;
}

/** How the loop ended: the scenario passes, a round was refused, or the limit of rounds was reached. */
export type LoopEnd = { built: true } | { refusal: Refusal } | { limit: Failing };

/**
 * Whether two failures are the same: the same step and the same message, without its stack lines, which move with
 * any change to the code (DOMAIN.md, Round).
 */
export function sameFailure(one: Failing, other: Failing): boolean {
  return one.step === other.step && withoutStack(one.message) === withoutStack(other.message);
}

/** A failure's message without its stack lines (`at …`). */
export function withoutStack(message: string): string {
  return message
    .split("\n")
    .filter((line) => !/^\s*at /.test(line))
    .join("\n")
    .trim();
}

/**
 * Runs rounds of test and code attempts while the scenario fails (FR-RUN-03), starting from its failure `before`. A
 * round after which the scenario fails the same way makes no progress: it is recorded through `onNoProgress`, and the
 * loop goes on. However the failure moves, the loop runs at most `rounds` rounds (FR-RUN-09).
 */
export async function innerLoop(
  round: () => Promise<Refusal | undefined>,
  failure: () => Promise<Failing | undefined>,
  before: Failing,
  rounds: number,
  onNoProgress: (failure: Failing) => Promise<void> = async () => {},
): Promise<LoopEnd> {
  let last = before;
  for (let done = 1; ; done += 1) {
    const refusal = await round();
    if (refusal !== undefined) return { refusal };
    const now = await failure();
    if (now === undefined) return { built: true };
    if (sameFailure(now, last)) await onNoProgress(now);
    last = now;
    if (done >= rounds) return { limit: now };
  }
}
