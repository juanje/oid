import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WRITABLE } from "./boundaries.ts";
import type { Mutant } from "./executor.ts";
import { classifyFailure, classifyScenario } from "./red-class.ts";
import type { Refusal } from "./refusal.ts";
import type { ScenarioRun } from "./scenarios.ts";
import type { UnitRun } from "./unit-tests.ts";

// The mutant (FR-EVID-03, D-02): when a scenario or a new test passes before its code, edits to the source that make
// it fail on an assertion show that it checks the behaviour. oid applies them only in a scratch copy.

const SOURCE = WRITABLE.code.join(", ");

/**
 * Applies a mutant's edits in `dir`, a scratch copy, or refuses it: every file must be source, and each edit's old
 * text must be in its file, as it is, exactly once. Nothing is applied unless every edit applies.
 */
export async function applyMutant(dir: string, mutant: Mutant): Promise<Refusal | undefined> {
  const notSource = mutant.files.map((file) => file.path).filter((path) => !WRITABLE.code.some((source) => path.startsWith(source)));
  if (notSource.length > 0) {
    return {
      failed: "The mutant edits files that are not source",
      evidence: notSource.join("\n"),
      next: `A mutant changes only the source, under ${SOURCE}: oid applies it in a copy to show that the test checks the behaviour`,
    };
  }
  const changed: [string, string][] = [];
  const unmatched: string[] = [];
  for (const { path, edits } of mutant.files) {
    const original = existsSync(join(dir, path)) ? await readFile(join(dir, path), "utf8") : undefined;
    let content = original ?? "";
    for (const { oldText, newText } of edits) {
      const times = original === undefined || oldText === "" ? 0 : original.split(oldText).length - 1;
      if (times !== 1) {
        unmatched.push(`${path}: its old text is there ${times} times: ${JSON.stringify(oldText)}`);
        continue;
      }
      content = content.replace(oldText, () => newText);
    }
    changed.push([path, content]);
  }
  if (unmatched.length > 0) {
    return {
      failed: "The mutant does not apply",
      evidence: unmatched.join("\n"),
      next: "Give each edit an old text that is in its file, as it is now, exactly once",
    };
  }
  for (const [path, content] of changed) await writeFile(join(dir, path), content);
  return undefined;
}

const PASSES_NEXT = "Change the source the scenario or test runs, so that what it asserts fails";
const CLASS_NEXT = "Change what the code does, not whether it exists: a removed or renamed piece only shows that the test calls it";

/** A scenario run under a mutant: it must fail with business_assertion. */
export function judgeScenarioUnderMutant(result: ScenarioRun, symbolExists: (name: string) => boolean): Refusal | undefined {
  const scenario = `${result.uri}:${result.line} "${result.name}"`;
  if (result.status === "passed") return { failed: "The scenario still passes under the mutant", evidence: scenario, next: PASSES_NEXT };
  const redClass = classifyScenario(result, symbolExists);
  if (redClass === "business_assertion") return undefined;
  return {
    failed: `Under the mutant, the scenario fails with ${redClass}, not on an assertion`,
    evidence: `${scenario}, step "${result.failure?.step ?? "?"}": ${result.failure?.message ?? result.status}`,
    next: CLASS_NEXT,
  };
}

/** The tests that passed before their code, run under a mutant: each must fail with business_assertion. */
export function judgeTestsUnderMutant(unit: UnitRun, passing: string[], symbolExists: (name: string, file: string) => boolean): { reds: string[] } | { refusal: Refusal } {
  const failures = new Map((unit.failures ?? []).map((failure) => [failure.test, failure.message]));
  const stillPass = passing.filter((test) => !failures.has(test));
  if (stillPass.length > 0) return { refusal: { failed: "These tests still pass under the mutant", evidence: stillPass.join("\n"), next: PASSES_NEXT } };
  const classes = passing.map((test) => {
    const message = failures.get(test)!;
    return { test, message, redClass: classifyFailure(message, (name) => symbolExists(name, test.split(" > ")[0]!)) };
  });
  const other = classes.filter(({ redClass }) => redClass !== "business_assertion");
  if (other.length > 0) {
    return {
      refusal: {
        failed: `Under the mutant, these tests fail with ${[...new Set(other.map(({ redClass }) => redClass))].join(", ")}, not on an assertion`,
        evidence: other.map(({ test, redClass, message }) => `${test}: ${redClass}: ${message}`).join("\n"),
        next: CLASS_NEXT,
      },
    };
  }
  return { reds: passing.map((test) => `${test}: business_assertion (mutant)`) };
}
