import type { AttemptKind } from "./executor.ts";

/**
 * Whether a request changes the kind of attempt that comes next (FR-STATE-02). Code comes next in the round of a
 * steps or a test attempt anyway; any other request changes it.
 */
export function changesNextKind(by: AttemptKind, kind: AttemptKind): boolean {
  return !(kind === "code" && (by === "steps" || by === "test"));
}
