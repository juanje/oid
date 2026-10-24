import type { Refusal } from "./refusal.ts";

/** One try of an attempt and its judgment: a refusal, if any, and how to go back to the work accepted before it. */
export interface Tried {
  refusal: Refusal | undefined;
  rollback: () => Promise<void>;
}

/**
 * Runs an attempt and, while it is refused and `limit` allows, goes back and retries it with the refusal (FR-RUN-07).
 * Returns the last refusal when the retries run out.
 */
export async function withRetries(limit: number, once: (previous: Refusal | undefined) => Promise<Tried>): Promise<Refusal | undefined> {
  let tried = await once(undefined);
  for (let retry = 0; tried.refusal !== undefined && retry < limit; retry += 1) {
    await tried.rollback();
    tried = await once(tried.refusal);
  }
  return tried.refusal;
}
