import { existsSync } from "node:fs";
import { join } from "node:path";
import { isTestFile, writablePaths } from "./boundaries.ts";
import type { CommandRunner } from "./command.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { type Judgment, judgeNewTests, judgeSteps } from "./evidence.ts";
import type { AttemptKind } from "./executor.ts";
import { importedSymbolsOf } from "./imported-symbols.ts";
import type { Refusal } from "./refusal.ts";
import { type FrRun, locationOf, testCount } from "./run-attempts.ts";
import { runAllScenarios, runScenarios, type ScenarioRun } from "./scenarios.ts";
import { runUnitTests, testsIn } from "./unit-tests.ts";
import { scratchCopy } from "./worktree.ts";

// The judgment of a steps or test attempt another one asked for (FR-RUN-04): D-02 on the code from before the
// scenario's first code attempt, and what passed kept passing.

/** The scenarios of the project that pass now, by `<uri>:<line>`. */
export async function passingScenarios(dir: string, check: CommandRunner): Promise<Set<string>> {
  const { results } = await runAllScenarios(dir, check);
  return new Set(results.filter((result) => result.status === "passed").map(locationOf));
}

/**
 * Judges an attempt asked for: it keeps the unit tests and the scenarios in `passing`, and what it wrote fails, with a
 * valid or provisional Red, on the code at `base`, in a scratch copy.
 */
export async function judgeAsked(run: FrRun, scenario: Scenario, kind: AttemptKind, files: string[], passing: Set<string>, base: string): Promise<Judgment> {
  const written = files.filter((file) => writablePaths(kind, run.layout).some((path) => file.startsWith(path)));
  const check = run.check("attempt");
  if (kind === "test") {
    const unit = await runUnitTests(run.worktree.dir, [], check);
    if (unit.ran && testCount(unit) < run.tests) return { refusal: fewerTests(run.tests, testCount(unit)), reds: [] };
    for (const test of testsIn(unit)) run.known.add(test);
  }
  const { results } = await runAllScenarios(run.worktree.dir, check);
  const turnedRed = results.filter((result) => passing.has(locationOf(result)) && result.status !== "passed");
  if (turnedRed.length > 0) return { refusal: turnedRedRefusal(turnedRed), reds: [] };
  const scratch = await scratchCopy(run.worktree, base);
  try {
    if (kind === "steps") {
      await scratch.put(written, "attempt");
      const result = (await runScenarios(scratch.dir, [scenario], check))[0]!;
      const stepFile = result.failure?.definedIn;
      const exists = await importedSymbolsOf(scratch.dir, stepFile === undefined ? [] : [stepFile]);
      return judgeSteps(result, (name) => exists(name, stepFile ?? ""));
    }
    const testFiles = written.filter((file) => isTestFile(file, run.layout));
    if (testFiles.length === 0) return { refusal: undefined, reds: [] };
    // The tests that passed there as they were before this attempt are not its to prove; any other must fail.
    await scratch.put(testFiles, "checkpoint");
    const before = testFiles.filter((file) => existsSync(join(scratch.dir, file)));
    const passedBefore = before.length === 0 ? [] : (await runUnitTests(scratch.dir, before, check)).passed;
    await scratch.put(testFiles, "attempt");
    // Awaited here: the scratch copy is removed in finally, once the judgment is done.
    return await judgeNewTests(scratch.dir, testFiles, check, await importedSymbolsOf(scratch.dir, testFiles), new Set(passedBefore), { source: run.layout.writable.code });
  } finally {
    await scratch.remove();
  }
}

function fewerTests(before: number, now: number): Refusal {
  return {
    failed: "The attempt left fewer unit tests",
    evidence: `The unit suite ran ${before} tests before this attempt, and ${now} after it`,
    next: "Keep every unit test: change the ones that are wrong, without removing them",
  };
}

function turnedRedRefusal(scenarios: ScenarioRun[]): Refusal {
  return {
    failed: "Scenarios that passed before this attempt no longer pass",
    evidence: scenarios.map((scenario) => `${scenario.uri}:${scenario.line} "${scenario.name}": ${scenario.status}`).join("\n"),
    next: "Keep every scenario that passed passing: the step definitions you change must hold for each scenario that uses them",
  };
}
