import type { ScenarioRun } from "./scenarios.ts";

// The Red classes of DOMAIN.md. One function decides them, for every runner (NFR-03).

export type RedClass = "business_assertion" | "missing_implementation" | "test_bug" | "environment" | "not_run" | "undecided";

export function isValidRed(redClass: RedClass): boolean {
  return redClass === "business_assertion" || redClass === "missing_implementation";
}

/** The class of a failure, from its message. `symbolExists` asks the project whether a name is declared in it. */
export function classifyFailure(message: string, symbolExists: (name: string) => boolean): RedClass {
  if (/^AssertionError\b/m.test(message)) return "business_assertion";
  // A relative or absolute path is a module of the project; a bare name would be a package.
  if (/Cannot find module '[./]/.test(message)) return "missing_implementation";
  const notAFunction = /(?:\(0 , )?([A-Za-z_$][\w$]*)\)?(?:\(\.\.\.\))? is not a function/.exec(message);
  if (notAFunction !== null) return symbolExists(notAFunction[1]!) ? "undecided" : "missing_implementation";
  return "undecided";
}

/** The class of a scenario's result after a steps attempt. */
export function classifyScenario(result: ScenarioRun, symbolExists: (name: string) => boolean): RedClass {
  if (result.status === "not run") return "not_run";
  // A scenario that passes with its step definitions alone shows nothing missing.
  if (result.status === "passed") return "test_bug";
  const failure = result.failure;
  if (failure === undefined) return "undecided";
  if (["UNDEFINED", "PENDING", "AMBIGUOUS"].includes(failure.status)) return "test_bug";
  // The scenario failed while being set up: never a Red, whatever the message says (DOMAIN.md, Red classes).
  if (failure.kind === "Context") return "test_bug";
  return classifyFailure(failure.message, symbolExists);
}
