import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WRITABLE } from "./boundaries.ts";
import type { CommandRunner } from "./command.ts";
import type { Scenario } from "./cucumber-messages.ts";
import type { Mutant } from "./executor.ts";
import { git } from "./git.ts";
import { importedSymbolsOf } from "./imported-symbols.ts";
import { classifyFailure, classifyScenario } from "./red-class.ts";
import type { Refusal } from "./refusal.ts";
import { runScenarios, type ScenarioRun } from "./scenarios.ts";
import { runUnitTests, type UnitRun } from "./unit-tests.ts";
import { type RunWorktree, scratchCopy } from "./worktree.ts";

// The mutant (FR-EVID-03, D-02): when a scenario or a new test passes before its code, edits to the source that make
// it fail on an assertion show that it checks the behaviour. oid applies them only in a scratch copy.

/**
 * Applies a mutant's edits in `dir`, a scratch copy, or refuses it: every file must be source, and each edit's old
 * text must be in its file, as it is, exactly once; one in several places is refused with the line where each starts.
 * Nothing is applied unless every edit applies.
 */
export async function applyMutant(dir: string, mutant: Mutant, source: string[] = WRITABLE.code): Promise<Refusal | undefined> {
  const notSource = mutant.files.map((file) => file.path).filter((path) => !source.some((prefix) => path.startsWith(prefix)));
  if (notSource.length > 0) {
    return {
      failed: "The mutant edits files that are not source",
      evidence: notSource.join("\n"),
      next: `A mutant changes only the source, under ${source.join(", ")}: oid applies it in a copy to show that the test checks the behaviour`,
    };
  }
  const changed: [string, string][] = [];
  const unmatched: string[] = [];
  for (const { path, edits } of mutant.files) {
    const original = existsSync(join(dir, path)) ? await readFile(join(dir, path), "utf8") : undefined;
    let content = original ?? "";
    for (const { oldText, newText } of edits) {
      const times = original === undefined || oldText === "" ? 0 : original.split(oldText).length - 1;
      if (times > 1) {
        const places = linesOf(original!, oldText).map((line) => `${path}:${line}`);
        unmatched.push(`${path}: its old text is in ${times} places, which start at ${places.join(", ")}: ${JSON.stringify(oldText)}`);
        continue;
      }
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
      next: "Give each edit an old text that is in its file, as it is now, exactly once: when it is in more than one place, add to it a line before or after that only the place you mean has, such as its function's signature",
    };
  }
  for (const [path, content] of changed) await writeFile(join(dir, path), content);
  return undefined;
}

/** The line, from 1, where each place `text` is in `content` starts. */
function linesOf(content: string, text: string): number[] {
  const lines: number[] = [];
  for (let at = content.indexOf(text); at !== -1; at = content.indexOf(text, at + text.length)) lines.push(content.slice(0, at).split("\n").length);
  return lines;
}

const PASSES_NEXT = "Change the source the scenario or test runs, so that what it asserts fails";
const CLASS_NEXT = "Change what the code does, not whether it exists: a removed or renamed piece only shows that the test calls it";

/** A scenario run under a mutant: it must fail with business_assertion. */
export function judgeScenarioUnderMutant(result: ScenarioRun, symbolExists: (name: string) => boolean): Refusal | undefined {
  const scenario = `${result.uri}:${result.line} "${result.name}"`;
  if (result.status === "passed") return { failed: "The scenario still passes under the mutant", evidence: scenario, next: PASSES_NEXT };
  // Code that never returns shows nothing about what the scenario checks (FR-RUN-09).
  if (result.failure?.status === "NOT FINISHED") {
    return {
      failed: "The scenario does not finish under the mutant",
      evidence: `${scenario}, step "${result.failure.step}": ${result.failure.message}`,
      next: "Make the mutant return something wrong, so that what the scenario asserts fails: a test tells correct code from broken code by a failing assertion",
    };
  }
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

/** Steps whose scenario passes before its code, under a mutant: in a scratch copy, the scenario fails on an assertion. */
export async function stepsUnderMutant(
  worktree: RunWorktree,
  source: string[],
  scenario: Scenario,
  files: string[],
  mutant: Mutant,
  run: CommandRunner,
): Promise<{ reds: string[] } | { refusal: Refusal }> {
  return underMutant(worktree, source, files, mutant, async (dir) => {
    const result = (await runScenarios(dir, [scenario], run))[0]!;
    const stepFile = result.failure?.definedIn;
    const exists = await importedSymbolsOf(dir, stepFile === undefined ? [] : [stepFile]);
    const refusal = judgeScenarioUnderMutant(result, (name) => exists(name, stepFile ?? ""));
    return refusal === undefined ? { reds: [`${scenario.uri}:${scenario.line} "${scenario.name}": business_assertion (mutant)`] } : { refusal };
  });
}

/** New tests that pass before their code, under a mutant: in a scratch copy, each fails on an assertion. */
export async function testsUnderMutant(
  worktree: RunWorktree,
  source: string[],
  testFiles: string[],
  mutant: Mutant,
  passing: string[],
  run: CommandRunner,
): Promise<{ reds: string[] } | { refusal: Refusal }> {
  return underMutant(worktree, source, testFiles, mutant, async (dir) => {
    const unit = await runUnitTests(dir, testFiles, run);
    return judgeTestsUnderMutant(unit, passing, await importedSymbolsOf(dir, testFiles));
  });
}

/** Runs `judge` in a scratch copy of the current code, with the attempt's files on top and the mutant applied. */
async function underMutant(
  worktree: RunWorktree,
  source: string[],
  files: string[],
  mutant: Mutant,
  judge: (dir: string) => Promise<{ reds: string[] } | { refusal: Refusal }>,
): Promise<{ reds: string[] } | { refusal: Refusal }> {
  const scratch = await scratchCopy(worktree, await git(worktree.dir, "rev-parse", "HEAD"));
  try {
    await scratch.put(files, "attempt");
    const refusal = await applyMutant(scratch.dir, mutant, source);
    if (refusal !== undefined) return { refusal };
    return await judge(scratch.dir);
  } finally {
    await scratch.remove();
  }
}
