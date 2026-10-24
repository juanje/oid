import { WRITABLE } from "./boundaries.ts";
import type { Attempt, AttemptKind } from "./executor.ts";
import { formatRefusal } from "./refusal.ts";

const WRITES: Record<AttemptKind, string> = {
  steps: "the step definitions of one scenario, so that it fails for the right reason",
  test: "one unit test for the next piece of logic, so that it fails before its code exists",
  code: "the source that makes the failing test and the scenario pass",
};

/** The system prompt of an attempt's agent: one per kind, since each writes its own part (FR-AGENT-02 deepens it). */
export function systemPromptFor(kind: AttemptKind): string {
  return [
    `You are oid's ${kind} agent. You write ${WRITES[kind]}.`,
    `You may write only under ${WRITABLE[kind].join(", ")}. You have no shell: use try to run a test or the scenario.`,
    "End with report, giving your result in a few words.",
  ].join("\n");
}

/** The task of one attempt: what to build, and, for a retry, why the attempt before it was refused. */
export function taskFor({ kind, fr, scenario, refusal }: Pick<Attempt, "kind" | "fr" | "scenario" | "refusal">): string {
  const task = `Write the ${kind} attempt of ${fr} for the scenario "${scenario}".`;
  return refusal === undefined ? task : `${task}\n\nThe attempt before this one was refused:\n${formatRefusal(refusal)}`;
}
