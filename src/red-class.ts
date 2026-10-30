import { dirname, resolve } from "node:path";
import { NO_DEFINITION } from "./cucumber-messages.ts";
import type { ScenarioRun } from "./scenarios.ts";

// The Red classes of DOMAIN.md. One function decides them, for every runner (NFR-03).

export type RedClass = "business_assertion" | "missing_implementation" | "test_bug" | "environment" | "not_run" | "undecided";

export function isValidRed(redClass: RedClass): boolean {
  return redClass === "business_assertion" || redClass === "missing_implementation";
}

/**
 * The class of a failure, from its message. `symbolExists` asks the project whether a name the failing file calls exists
 * in it. A member reached through a chain of names (`this.shortener.resolve`) is undecided: accepted provisionally, the
 * code confirms it (D-02).
 */
export function classifyFailure(message: string, symbolExists: (name: string) => boolean, inSource: (path: string) => boolean = () => true): RedClass {
  if (/^AssertionError\b/m.test(message)) return "business_assertion";
  // vitest's `rejects` and `resolves` when the promise settles the other way: an assertion about behaviour all the same.
  if (/^Error: promise (?:resolved .* instead of rejecting|rejected .* instead of resolving)/m.test(message)) return "business_assertion";
  // vitest says this of a test file it cannot parse, such as one with a syntax error.
  if (/^Transform failed\b/m.test(message)) return "test_bug";
  if (/Cannot find package '/.test(message)) return "environment";
  // A relative or absolute path is a module of the project; a bare name would be a package. Code can create it only
  // under the source, so a test that looks for it elsewhere is wrong (DOMAIN.md, Red classes).
  if (/Cannot find module '[./]/.test(message)) {
    const path = missingModule(message);
    return path === undefined || inSource(path) ? "missing_implementation" : "test_bug";
  }
  // A callee that does not start a chain of names, such as `(intermediate value).resolve`, leaves nothing to ask.
  const notAFunction = /(?<![\w$.)])(?:\(0 , )?((?:this|[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*)\)?(?:\(\.\.\.\))? is not a function/.exec(message);
  if (notAFunction === null || notAFunction[1]!.includes(".")) return "undecided";
  return symbolExists(notAFunction[1]!) ? "undecided" : "missing_implementation";
  return "undecided";
}

/** The absolute path of the project module a failure cannot find, resolved against the file that imports it. */
export function missingModule(message: string): string | undefined {
  const found = /Cannot find module '([./][^']*)' imported from '?([^'\s]+)/.exec(message);
  return found === null ? undefined : resolve(dirname(found[2]!), found[1]!);
}

/** The class of a scenario's result after a steps attempt. */
export function classifyScenario(result: ScenarioRun, symbolExists: (name: string) => boolean): RedClass {
  if (result.status === "not run") return "not_run";
  // A scenario that passes with its step definitions alone shows nothing missing.
  if (result.status === "passed") return "test_bug";
  const failure = result.failure;
  if (failure === undefined) return "undecided";
  if (NO_DEFINITION.has(failure.status)) return "test_bug";
  // The scenario failed while being set up: never a Red, whatever the message says (DOMAIN.md, Red classes).
  if (failure.kind === "Context") return "test_bug";
  return classifyFailure(failure.message, symbolExists);
}
