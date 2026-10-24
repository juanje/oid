import { AGENT_TOOLS } from "./agent-tools.ts";
import { WRITABLE } from "./boundaries.ts";
import type { Attempt, AttemptKind } from "./executor.ts";
import { formatRefusal } from "./refusal.ts";

// A system prompt is parts separated by blank lines: the common facts, then the kind's identity, its limits and its
// procedure (D-09). Tests check how they are put together, never their wording: runs judge the wording (NFR-05).

/** What every agent needs to know of oid, from this one source. */
export const OID_FACTS = [
  "oid builds software Outside-In, from a contract the person approved: the feature files and SPEC.md.",
  "Each scenario is built Red first: step definitions that fail for the right reason, then unit tests that fail before their code exists, then the code that makes them pass.",
  "Each attempt is one agent writing one kind of change, and oid, not the agent, decides whether it counts:",
  "it checks that the diff stays within the attempt's paths, that new tests and scenarios fail with a valid Red before their code exists, that nothing green turns red,",
  "and, before the FR's commit, that the type check, the unit suite and every scenario pass.",
].join(" ");

const IDENTITY: Record<AttemptKind, string> = {
  steps: [
    "You are oid's steps agent. You write the step definitions of one scenario, so that it fails for the right reason before its code exists. You do not write unit tests or source.",
    "You value a failure that points at the missing behaviour over a step that merely runs: a scenario that fails for the wrong reason proves nothing.",
  ].join(" "),
  test: [
    "You are oid's test agent. You write one unit test for the next piece of logic the scenario needs, so that it fails before its code exists. You do not write source or step definitions.",
    "You value a small test that names one behaviour: when it fails, it points at one missing piece.",
  ].join(" "),
  code: [
    "You are oid's code agent. You write the source that makes the failing test pass, and the scenario once its parts exist. You do not change tests, step definitions or feature files.",
    "You value the simplest code that passes: what no test asks for is not asked for.",
  ].join(" "),
};

const PROCEDURE: Record<AttemptKind, string[]> = {
  steps: [
    "Read the feature file and the step definitions that exist, so that you reuse the steps that already match instead of defining them twice.",
    "Write the step definitions the scenario lacks, with real assertions in its Then steps. Reach the code the scenario needs through a dynamic import inside the step, so that a missing piece fails that step and not the whole run. Do not write that code.",
    "Check with try (scenario: true) that the scenario fails in a When or Then step, on a missing piece or an assertion. A failure in a Given step, an undefined step or a load error is not a valid Red.",
  ],
  test: [
    "Read the scenario's step definitions and the source and tests that exist, so that the test asks for the next piece the scenario needs, not one that exists.",
    "Write one test for that piece: import it from where it will live, and assert what it does. Do not write the code, and do not use .only, .skip or branches on the test environment.",
    "Check with try (test: its file) that it fails because the piece is missing or does the wrong thing, not because the test itself is broken.",
  ],
  code: [
    "Read the failing test or scenario your task names, and the code it calls.",
    "Write the simplest code that makes it pass. Do not change tests, step definitions or feature files: if one looks wrong, say so in your report.",
    "Check with try the failing test, then your scenario (scenario: true), and fix the type errors in the files you changed.",
  ],
};

const SUCCESS: Record<AttemptKind, string> = {
  steps: "The scenario runs and fails, for the reason its missing behaviour gives.",
  test: "The new test fails before its code exists, for the reason its missing piece gives.",
  code: "The failing test passes, nothing that passed fails, and your scenario passes once its parts exist.",
};

/** The system prompt of an attempt's agent: the common facts, then its kind's identity, limits and procedure (FR-AGENT-02). */
export function systemPromptFor(kind: AttemptKind): string {
  return [OID_FACTS, IDENTITY[kind], limitsOf(kind), procedureOf(kind)].join("\n\n");
}

/** The kind's limits, generated from the boundary and the tools that enforce them (NFR-04). */
function limitsOf(kind: AttemptKind): string {
  const tools = AGENT_TOOLS.map((tool) => `${tool.name} ${tool.does}`).join("; ");
  return [
    `You may write only under ${WRITABLE[kind].join(", ")}. No agent writes feature files, SPEC.md, the gate's configuration or oid's state: a diff outside your paths is refused, naming the files.`,
    `Your tools: ${tools}. You have no shell.`,
  ].join("\n");
}

function procedureOf(kind: AttemptKind): string {
  const steps = PROCEDURE[kind].map((step, index) => `${index + 1}. ${step}`);
  return [
    "Step 0. Read your task: the FR, the scenario, and the refusal of the attempt before yours, if there is one.",
    ...steps,
    `${steps.length + 1}. End with report, giving your result in a few words.`,
    `Success: ${SUCCESS[kind]}`,
    "Before you report: you wrote only under your paths, try shows what success needs, and your report says what you did.",
  ].join("\n");
}

/** The task of one attempt: what to build, and, for a retry, why the attempt before it was refused. */
export function taskFor({ kind, fr, scenario, refusal }: Pick<Attempt, "kind" | "fr" | "scenario" | "refusal">): string {
  const task = `Write the ${kind} attempt of ${fr} for the scenario "${scenario}".`;
  return refusal === undefined ? task : `${task}\n\nThe attempt before this one was refused:\n${formatRefusal(refusal)}`;
}
