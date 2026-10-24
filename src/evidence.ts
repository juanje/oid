import { readFile, realpath } from "node:fs/promises";
import { projectBin, runCommand } from "./command.ts";
import { reportPath } from "./git.ts";
import type { Refusal } from "./refusal.ts";
import type { ScenarioRun } from "./scenarios.ts";
import type { UnitRun } from "./unit-tests.ts";
import { passedTests } from "./vitest-report.ts";

/** Refuses a steps attempt unless its scenario ran and failed: a scenario that passes before its code proves nothing (D-02). */
export function judgeSteps(result: ScenarioRun): Refusal | undefined {
  if (result.status === "failed") return undefined;
  const scenario = `${result.uri}:${result.line} "${result.name}"`;
  if (result.status === "passed") {
    return {
      failed: "The scenario passes before its code exists",
      evidence: `${scenario} passed with the new step definitions alone`,
      next: "Make the step definitions call the code under test and assert the outcome the scenario states",
    };
  }
  return {
    failed: "The scenario did not run",
    evidence: `${scenario} is missing from cucumber-js's report`,
    next: "Check that the step definitions load: a static import of a module that does not exist yet stops cucumber-js; import it dynamically inside the step",
  };
}

/** Refuses a code attempt that leaves any unit test failing or turns a green scenario red. The current scenario may still fail. */
export function judgeCode(unit: UnitRun, greenScenarios: ScenarioRun[]): Refusal | undefined {
  if (!unit.ran) {
    return {
      failed: "The unit suite did not run",
      evidence: unit.output,
      next: "Fix what stops vitest from loading the suite, such as a syntax error in the source",
    };
  }
  if (unit.failed.length > 0) {
    return {
      failed: "Unit tests fail after the code",
      evidence: unit.failed.join("\n"),
      next: "Change the code until these tests pass, without changing the tests",
    };
  }
  const turnedRed = greenScenarios.filter((scenario) => scenario.status !== "passed");
  if (turnedRed.length > 0) {
    return {
      failed: "Scenarios that passed before this code no longer pass",
      evidence: turnedRed.map((scenario) => `${scenario.uri}:${scenario.line} "${scenario.name}": ${scenario.status}`).join("\n"),
      next: "Change the code so that these scenarios pass again, keeping the unit tests green",
    };
  }
  return undefined;
}

/** Refuses a test attempt whose new tests pass on the code they were written against: such a test proves nothing (D-02). */
export async function judgeNewTests(worktreeDir: string, testFiles: string[]): Promise<Refusal | undefined> {
  const passing = await testsThatPass(worktreeDir, testFiles);
  if (passing.length === 0) return undefined;
  return {
    failed: "New tests pass before their code exists",
    evidence: passing.join("\n"),
    next: "Make each of these tests assert behaviour the code does not have yet",
  };
}

async function testsThatPass(worktreeDir: string, testFiles: string[]): Promise<string[]> {
  const report = await reportPath(worktreeDir, "oid-new-tests.json");
  const vitest = projectBin(worktreeDir, "vitest");
  await runCommand(vitest, ["run", ...testFiles, "--reporter=json", `--outputFile=${report}`], { cwd: worktreeDir });
  // vitest reports real paths, and the worktree may sit behind a symlink such as macOS's /var.
  return passedTests(JSON.parse(await readFile(report, "utf8")), await realpath(worktreeDir));
}
