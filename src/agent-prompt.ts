import { AGENT_TOOLS } from "./agent-tools.ts";
import { DEFAULT_LAYOUT, type Layout, writablePaths } from "./boundaries.ts";
import { RUNNERS, runnerText } from "./runners.ts";
import type { Attempt, AttemptKind, PathsKind, TaskContext } from "./executor.ts";
import { formatRefusal, type Refusal } from "./refusal.ts";

// A system prompt is parts separated by blank lines: the common facts, then the kind's identity, its limits and its
// procedure (D-09). Tests check how they are put together, never their wording: runs judge the wording (NFR-05).

/** What every agent needs to know of oid, from this one source, naming the project's spec. */
export const oidFacts = (spec: string): string => [
  `oid builds software Outside-In, from a contract the person approved: the feature files and ${spec}.`,
  "Each scenario is built Red first: step definitions that fail for the right reason, then unit tests that fail before their code exists, then the code that makes them pass.",
  "Each attempt is one agent writing one kind of change, and oid, not the agent, decides whether it counts:",
  "it checks that the diff stays within the attempt's paths, that new tests and scenarios fail with a valid Red before their code exists, that nothing green turns red,",
  "and, before the FR's commit, that the type check, the unit suite and every scenario pass.",
  "The run is one team's work, judged as a whole: the FR built, with every behaviour proved by a test that failed first.",
  "Each agent does only its part, because the next agent's work starts where it stops.",
].join(" ");

/** The common facts of a project that keeps its spec in SPEC.md. */
export const OID_FACTS = oidFacts(DEFAULT_LAYOUT.spec);

/**
 * A value of the agents that write a Red before its code exists (H25): call the code as it will be offered, since
 * oid checks types only once the code exists, and a cast written for a check that has not run outlives it.
 */
export const CALL_AS_OFFERED: Partial<Record<AttemptKind, string>> = {
  steps:
    "You value reaching the code through its dynamic import and calling it exactly as it will be offered, even before it exists and while its types do not match yet: oid checks types only once the code attempt has written it, and a cast written for a check that has not run stays in the step definitions after the code exists.",
  test: "You value calling the piece exactly as the code will offer it, even before it exists and while its types do not match yet: oid checks types only once the code attempt has written it, and a cast written for a check that has not run stays in the test after the code exists.",
};

const IDENTITY = (spec: string): Record<AttemptKind, string> => ({
  steps: [
    "You are oid's steps agent. You write the step definitions of one scenario, so that it fails for the right reason before its code exists. You do not write unit tests or source.",
    "You value a failure that points at the missing behaviour over a step that merely runs: a scenario that fails for the wrong reason proves nothing.",
    "You value asserting only what the scenario's text states: an assertion beyond it is a contract the person never approved, and makes the code agent build what no requirement asks for yet.",
    CALL_AS_OFFERED.steps,
  ].join(" "),
  test: [
    "You are oid's test agent. You write one unit test for the next piece of logic the scenario needs, so that it fails before its code exists. You do not write source or step definitions.",
    "You value a small test that names one behaviour: when it fails, it points at one missing piece.",
    CALL_AS_OFFERED.test,
  ].join(" "),
  code: [
    "You are oid's code agent. You write the source that makes the failing test pass, and the scenario once its parts exist. You do not change tests, step definitions or feature files.",
    `You value stopping at the failing test, even when ${spec} describes more: code for a behaviour no test asks for yet leaves the next test agent nothing that can fail, so that behaviour can no longer be proved Red first. The other requirements come later, each with its scenario and its tests.`,
  ].join(" "),
  "refactor-code": [
    "You are oid's cleanup agent. Every scenario of the FR passes; you remove one finding from the source — a duplication or a function too complex — without changing what the code does. You do not change tests, step definitions or feature files.",
    "You value the smallest change that removes the finding: the unchanged tests are the proof that the behaviour did not change, and the unchanged exports keep valid everything that imports them.",
  ].join(" "),
});

const PROCEDURE = (spec: string): Record<AttemptKind, string[]> => ({
  steps: [
    "Read the feature file and the step definitions that exist, so that you reuse the steps that already match instead of defining them twice.",
    `Write the step definitions the scenario lacks, with real assertions in its Then steps that check what each step's text states and nothing more, even when ${spec} describes more: the other behaviours come with their own scenarios. Reach the code the scenario needs through a dynamic import inside the step, so that a missing piece fails that step and not the whole run. Do not write that code.`,
    "Check with try (scenario: true) that the scenario fails in a When or Then step, on a missing piece or an assertion. A failure in a Given step, an undefined step or a load error is not a valid Red.",
  ],
  test: [
    "Read the scenario's step definitions and the source and tests that exist, so that the test asks for the next piece the scenario needs, not one that exists.",
    "Write one test for that piece: import it from where it will live, and assert what it does. Do not write the code, and do not use .only, .skip or branches on the test environment.",
    "Check with try (test: its file) that it fails because the piece is missing or does the wrong thing, not because the test itself is broken.",
  ],
  code: [
    "Read the failing test or scenario your task names, and the code it calls.",
    "Write the simplest code that makes it pass, and stop there: code no test asks for yet costs the run extra cycles and leaves code that no test checks. Do not change tests, step definitions or feature files: if one looks wrong, say so in your report.",
    "Check with try the failing test, then your scenario (scenario: true), and fix the type errors in the files you changed.",
  ],
  "refactor-code": [
    "Read the finding in your task and the code at each of its places.",
    "Remove the finding with the smallest change that keeps the behaviour: extract a repeated run into one piece that every place calls, or split a function too complex into smaller ones. Keep every module exporting the same names with the same signatures, and add nothing the finding does not ask for.",
    "Check with try your scenario (scenario: true), and fix the type errors in the files you changed.",
  ],
});

const SUCCESS: Record<AttemptKind, string> = {
  steps: "The scenario runs and fails, for the reason its missing behaviour gives.",
  test: "The new test fails before its code exists, for the reason its missing piece gives.",
  code: "The failing test passes, nothing that passed fails, and your scenario passes once its parts exist.",
  "refactor-code": "The finding is gone, no new one appears, and every test and scenario passes as before, none of them changed.",
};

/** The system prompt of an attempt's agent: the common facts, then its kind's identity, limits and procedure (FR-AGENT-02). */
export function systemPromptFor(kind: AttemptKind, layout: Layout = DEFAULT_LAYOUT): string {
  return [oidFacts(layout.spec), IDENTITY(layout.spec)[kind], limitsOf(kind, layout), procedureOf(kind, layout)].join("\n\n");
}

// The runner that runs the files each kind writes: the code agent's source is run by both, through the tests.
const RUNS: Partial<Record<AttemptKind, (typeof RUNNERS)[keyof typeof RUNNERS]>> = { test: RUNNERS.unit, steps: RUNNERS.scenarios };

/** The kind's limits, generated from the boundary, the tools and the runners that enforce them (NFR-04). */
function limitsOf(kind: AttemptKind, layout: Layout): string {
  const tools = AGENT_TOOLS.map((tool) => `${tool.name} ${tool.does}`).join("; ");
  return [
    `You may write only under ${writablePaths(kind, layout).join(", ")}. No agent writes feature files, ${layout.spec}, the gate's configuration or oid's state: a diff outside your paths is refused, naming the files.`,
    `Your tools: ${tools}. You have no shell.`,
    ...(RUNS[kind] === undefined ? [] : [runnerText(RUNS[kind])]),
  ].join("\n");
}

/** How to ask for the attempt kind that owns a cause outside the kind's paths, from the paths each kind writes (FR-RUN-04). */
function askFor(kind: AttemptKind, { writable }: Layout): string {
  if (kind === "refactor-code") return "If the cleanup cannot be made without changing a test, a step definition or an export, change nothing: end with report saying why.";
  const others = (Object.keys(writable) as PathsKind[]).filter((other) => other !== kind);
  const owners = others.map((other) => `a ${other} attempt writes ${writable[other].join(", ")}`).join("; ");
  return `If the cause of the failure lies outside your paths, change nothing to work around it: end with report asking, in next, for the kind of attempt that owns those paths, and say why (${owners}).`;
}

function procedureOf(kind: AttemptKind, layout: Layout): string {
  const steps = [...PROCEDURE(layout.spec)[kind], askFor(kind, layout)].map((step, index) => `${index + 1}. ${step}`);
  return [
    "Step 0. Read your task: the FR, the scenario, and the refusal of the attempt before yours, or why it asked for yours, if there is one.",
    ...steps,
    `${steps.length + 1}. End with report, giving your result in a few words.`,
    `Success: ${SUCCESS[kind]}`,
    "Before you report: you wrote only under your paths, try shows what success needs, and your report says what you did.",
  ].join("\n");
}

function codeText({ files, cut }: NonNullable<TaskContext["code"]>): string {
  const shown = files.map(({ path, content }) => `--- ${path}\n${content.trimEnd()}`);
  const left = cut.length === 0 ? [] : [`Also relevant, left out for length: ${cut.join(", ")}`];
  return ["The code relevant to the scenario: the step definitions, the modules they import, and the unit tests that import those.", ...shown, ...left].join("\n");
}

/** What the gate found failing, which the attempt after it must fix first, whatever FR it belongs to (FR-GATE-04). */
function focusText({ scenarios, tests }: NonNullable<Refusal["focus"]>): string {
  const lines = ["Fix these first: the gate found them failing."];
  for (const { uri, line, name, steps, failure } of scenarios) {
    lines.push(`Scenario ${uri}:${line} "${name}"`, ...(steps ?? []).map((step) => `  ${step}`));
    if (failure !== undefined) lines.push(`  fails at the step "${failure.step}":`, failure.message);
  }
  for (const test of tests) lines.push(`Unit test ${test}`);
  return lines.join("\n");
}

function failureText({ step, message, definition }: NonNullable<TaskContext["failure"]>): string {
  const where = definition === undefined ? "" : `\nIts step is defined at ${definition.file}:${definition.line}:\n${definition.source}`;
  return `The scenario fails at the step "${step}":\n${message}${where}`;
}

// What each kind writes, for the opening of a repair's task.
const WRITES: Record<AttemptKind, string> = { steps: "step definitions", test: "unit tests", code: "source", "refactor-code": "source" };

/**
 * The task of one attempt: what to build, from what the run gathered for it, and, for a retry, why the attempt before
 * it was refused. A repair, an attempt the gate sent back or one another attempt asked for, opens instead with its job,
 * generated from that refusal or request, and its evidence, before the rest (FR-AGENT-03).
 */
export function taskFor({ kind, fr, scenario, refusal, asked, context }: Pick<Attempt, "kind" | "fr" | "scenario" | "refusal" | "asked" | "context">): string {
  const repair = repairOpening({ kind, fr, scenario, refusal, asked, context });
  const cleanup = context?.finding === undefined ? undefined : [`Remove this finding from the source of ${fr}, without changing what the code does:\n${context.finding}`];
  const parts = repair ?? cleanup ?? [`Write the ${kind} attempt of ${fr} for the scenario "${scenario}".`];
  if (context?.fr !== undefined) parts.push(`The FR, from the spec:\n${context.fr}`);
  if (context?.domain !== undefined) parts.push(`The project's domain:\n${context.domain}`);
  if (context?.conventions !== undefined) parts.push(`The project's conventions:\n${context.conventions}`);
  if (context !== undefined && context.steps.length > 0) parts.push(`The scenario's steps:\n${context.steps.join("\n")}`);
  // An attempt asked for got the scenario's failure in its opening.
  if (context?.failure !== undefined && asked === undefined) parts.push(failureText(context.failure));
  if (context?.code !== undefined) parts.push(codeText(context.code));
  if (context?.patterns !== undefined && context.patterns.length > 0) {
    parts.push(`The step definitions the project has: reuse a step that matches instead of defining it again, which cucumber-js reports as ambiguous.\n${context.patterns.join("\n")}`);
  }
  if (repair !== undefined) return parts.join("\n\n");
  if (refusal !== undefined) parts.push(`The attempt before this one was refused:\n${formatRefusal(refusal)}`);
  if (refusal?.focus !== undefined) parts.push(focusText(refusal.focus));
  return parts.join("\n\n");
}

/** A repair's job and its evidence, or nothing for any other attempt. */
function repairOpening({ kind, fr, scenario, refusal, asked, context }: Pick<Attempt, "kind" | "fr" | "scenario" | "refusal" | "asked" | "context">): string[] | undefined {
  if (refusal?.from === "gate") {
    const parts = [`Fix what the gate refused in the ${WRITES[kind]} of ${fr}: ${refusal.failed}`, `The gate's refusal:\n${formatRefusal(refusal)}`];
    return refusal.focus === undefined ? parts : [...parts, focusText(refusal.focus)];
  }
  if (asked === undefined) return undefined;
  const parts = [`Act on the ${asked.by} attempt's request for a ${kind} attempt in ${fr}, for the scenario "${scenario}".`, `Why the ${asked.by} attempt asked for it:\n${asked.reason}`];
  if (context?.failure !== undefined) parts.push(failureText(context.failure));
  if (refusal !== undefined) parts.push(`The attempt before this one was refused:\n${formatRefusal(refusal)}`);
  return parts;
}
