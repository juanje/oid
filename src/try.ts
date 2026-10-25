import { type CommandRunner, projectBin } from "./command.ts";
import type { Scenario } from "./cucumber-messages.ts";
import type { TryResult, TryTarget } from "./executor.ts";
import { runScenarios } from "./scenarios.ts";
import { isInFile, runUnitTests } from "./unit-tests.ts";
import { attemptFiles } from "./worktree.ts";

/**
 * The try tool (FR-AGENT-06): runs one test file or the attempt's scenario, and only when it passes, the type check,
 * answering with the errors in the files the attempt changed; a failing target is answered with its failure alone. It records nothing: oid's own judgment comes after and does not trust it.
 */
export async function tryAttempt(dir: string, scenario: Scenario, target: TryTarget, run: CommandRunner): Promise<TryResult> {
  const targetFailure = "test" in target ? await tryTest(dir, target.test, run) : await tryScenario(dir, scenario, run);
  if (targetFailure !== undefined) return targetFailure;
  const { output } = await run(projectBin(dir, "tsc"), ["--noEmit"], { cwd: dir });
  const errors = typeErrorsIn(output, await attemptFiles(dir));
  if (errors.length > 0) {
    return {
      passed: false,
      failed: "The type check (types) fails in files this attempt changed",
      evidence: errors.join("\n"),
      next: "Fix these type errors in the files you changed",
    };
  }
  return { passed: true };
}

async function tryTest(dir: string, file: string, run: CommandRunner): Promise<TryResult | undefined> {
  const unit = await runUnitTests(dir, [file], run);
  const failures = (unit.failures ?? []).filter((failure) => isInFile(failure.test, file));
  const ran = unit.ran && (failures.length > 0 || unit.passed.some((test) => isInFile(test, file)));
  if (!ran) return { passed: false, failed: `${file} ran no test`, evidence: unit.output, next: "Put the test where vitest collects it, and check that it loads" };
  if (failures.length === 0) return undefined;
  return {
    passed: false,
    failed: `Tests in ${file} fail`,
    evidence: failures.map((failure) => `${failure.test}: ${failure.message}`).join("\n"),
    next: "Read the failure: before the code exists it should say the behaviour is missing; after, the code should make it pass",
  };
}

async function tryScenario(dir: string, scenario: Scenario, run: CommandRunner): Promise<TryResult | undefined> {
  const [result] = await runScenarios(dir, [scenario], run);
  if (result?.status === "passed") return undefined;
  const failure = result?.failure;
  return {
    passed: false,
    failed: `The scenario "${scenario.name}" ${result?.status ?? "did not run"}`,
    evidence: failure === undefined ? `${scenario.uri}:${scenario.line}` : `step "${failure.step}": ${failure.status} ${failure.message}`,
    next: "Read the failing step: it says what the scenario still misses",
  };
}

/** The lines of tsc's output about errors in `files`. */
export function typeErrorsIn(output: string, files: string[]): string[] {
  return output.split("\n").filter((line) => files.some((file) => line.startsWith(`${file}(`)));
}
