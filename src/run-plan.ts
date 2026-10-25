import type { Scenario, ScenarioResult } from "./cucumber-messages.ts";
import type { Refusal } from "./refusal.ts";

// A run of several FRs (FR-RUN-05): its id, its base at the start (FR-RUN-10), and the gate's scope (FR-GATE-01).

/** A run of one FR is named after it; a run of several, after the first and the last, as a git branch can be named. */
export function runIdOf(frs: string[], stamp: string): string {
  // "..", which would read better, is not allowed in a git branch name.
  const name = frs.length === 1 ? frs[0]! : `${frs[0]!}-to-${frs[frs.length - 1]!}`;
  return `${name}-${stamp}`;
}

/** The scenarios as they were when the run started, by `<uri>:<line>`, of the FRs outside the run (FR-RUN-10). */
export interface StartingScenarios {
  /** Passing: the gate holds them. */
  passing: Set<string>;
  /** Failing on an undefined or pending step: their FR is not built yet, and the gate leaves them out. */
  notBuilt: Scenario[];
  /** Failing with their steps defined: a built FR that is broken, which refuses the run. */
  broken: ScenarioResult[];
}

const NOT_BUILT = new Set(["UNDEFINED", "PENDING"]);

/** Sorts the scenarios of the run's start, leaving out those of the FRs in the run, `inRun`, which fail until they are built. */
export function startingScenarios(results: ScenarioResult[], inRun: Set<string>): StartingScenarios {
  const outside = results.filter((result) => !inRun.has(locationOf(result)));
  const failing = outside.filter((result) => result.status !== "passed");
  return {
    passing: new Set(outside.filter((result) => result.status === "passed").map(locationOf)),
    notBuilt: failing.filter((result) => NOT_BUILT.has(result.failure?.status ?? "")).map(({ uri, line, name }) => ({ uri, line, name })),
    broken: failing.filter((result) => !NOT_BUILT.has(result.failure?.status ?? "")),
  };
}

/** The scenarios an FR's gate runs: those that passed at the start and those the run built; the others it leaves out. */
export function gateScope(all: Scenario[], passing: Set<string>, built: Scenario[]): { scope: string[]; leftOut: Scenario[] } {
  const held = new Set([...passing, ...built.map(locationOf)]);
  return { scope: all.map(locationOf).filter((location) => held.has(location)), leftOut: all.filter((scenario) => !held.has(locationOf(scenario))) };
}

/** The refusal of a run whose base is red: a built FR's scenarios fail before any attempt (FR-RUN-10). */
export function brokenBaseRefusal(broken: ScenarioResult[]): Refusal {
  return {
    failed: "The base is red: scenarios of FRs built before this run fail before any attempt",
    evidence: broken.map((result) => `${locationOf(result)} "${result.name}", step "${result.failure?.step ?? "?"}": ${result.failure?.message ?? result.failure?.status ?? ""}`).join("\n"),
    next: "Fix these scenarios on the branch the run starts from, then run it again",
  };
}

function locationOf(scenario: Scenario): string {
  return `${scenario.uri}:${scenario.line}`;
}
