import type { Refusal } from "./refusal.ts";

/** How the scenario fails: the step, and the failure's message. */
export interface Failing {
  step: string;
  message: string;
}

/** A round's end: a refusal ends the loop; otherwise whether its test attempt added a test. */
export type RoundResult = { refusal: Refusal } | { added: boolean };

/** How the loop ended: the scenario passes, a round was refused, rounds with no progress used the retries up, or the limit of rounds was reached. */
export type LoopEnd = { built: true } | { refusal: Refusal } | { stalled: Failing } | { limit: Failing };

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
 * round makes no progress when it adds no test, or when the scenario then fails the same way; each one in a row spends
 * a retry, the next round gets the unchanged failure, and a round that moves the failure on resets the count. However
 * the failure moves, the loop runs at most `limits.rounds` rounds (FR-RUN-09).
 */
export async function innerLoop(
  round: (unchanged: Failing | undefined) => Promise<RoundResult>,
  failure: () => Promise<Failing | undefined>,
  before: Failing,
  limits: { retries: number; rounds: number },
  onNoProgress: (failure: Failing) => Promise<void> = async () => {},
): Promise<LoopEnd> {
  let last = before;
  let stalls = 0;
  let unchanged: Failing | undefined;
  for (let rounds = 1; ; rounds += 1) {
    const result = await round(unchanged);
    if ("refusal" in result) return { refusal: result.refusal };
    // A round that added no test was not accepted: the scenario is as it was.
    const now = result.added ? await failure() : last;
    if (now === undefined) return { built: true };
    const progress = result.added && !sameFailure(now, last);
    last = now;
    unchanged = progress ? undefined : now;
    if (!progress) {
      await onNoProgress(now);
      stalls += 1;
      if (stalls > limits.retries) return { stalled: now };
    } else {
      stalls = 0;
    }
    if (rounds >= limits.rounds) return { limit: now };
  }
}
