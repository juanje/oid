import type { CommandRunner } from "./command.ts";
import type { Scenario } from "./cucumber-messages.ts";
import { classifyFailure, classifyScenario, isValidRed, type RedClass } from "./red-class.ts";
import type { Refusal } from "./refusal.ts";
import type { ScenarioRun } from "./scenarios.ts";
import { runUnitTests, type UnitRun } from "./unit-tests.ts";

/** An attempt's evidence: a refusal, or the valid Reds it showed, each as `<what failed>: <class>`. */
export interface Judgment {
  refusal: Refusal | undefined;
  reds: string[];
}

const accepted = (reds: string[]): Judgment => ({ refusal: undefined, reds });
const refused = (refusal: Refusal): Judgment => ({ refusal, reds: [] });

// What the agent can do about a failure that is not a valid Red, by its class.
const NEXT: Record<RedClass, string> = {
  business_assertion: "",
  missing_implementation: "",
  test_bug: "Fix the test itself so that it runs and fails only because the behaviour is missing",
  environment: "Use only what the project already has installed; the gate's configuration, package.json included, is not yours to change",
  not_run: "Put the test where the runner collects it, and check that it loads",
  undecided:
    "oid cannot tell that this failure shows missing behaviour: make the test fail on an assertion about the behaviour, or on the code under test not existing yet",
};

/** Accepts a steps attempt only when its scenario ran and failed with a valid Red (D-02). */
export function judgeSteps(result: ScenarioRun, symbolExists: (name: string) => boolean): Judgment {
  const scenario = describeScenario(result);
  if (result.status === "passed") {
    return refused({
      failed: "The scenario passes before its code exists: test_bug",
      evidence: `${scenario} passed with the new step definitions alone`,
      next: "Make the step definitions call the code under test and assert the outcome the scenario states",
    });
  }
  if (result.status === "not run") {
    return refused({
      failed: "The scenario did not run: not_run",
      evidence: `${scenario} is missing from cucumber-js's report`,
      next: "Check that the step definitions load: a static import of a module that does not exist yet stops cucumber-js; import it dynamically inside the step",
    });
  }
  const redClass = classifyScenario(result, symbolExists);
  if (isValidRed(redClass)) return accepted([`${scenario}: ${redClass}`]);
  const failure = result.failure;
  const where = `${scenario}, step "${failure?.step ?? "?"}"`;
  if (failure?.kind === "Context") {
    return refused({
      failed: `The scenario fails while being set up, in a Given or Background step: ${redClass}`,
      evidence: `${where}: ${failure.message}`,
      next: "Set the scenario up without code that does not exist yet, or move that behaviour into a When or Then step",
    });
  }
  if (failure !== undefined && failure.message === "") {
    return refused({
      failed: `A step of the scenario has no usable definition: ${redClass}`,
      evidence: `${where}: ${failure.status}`,
      next: "Define every step of the scenario exactly once, with a real assertion where it checks an outcome",
    });
  }
  return refused({
    failed: `The scenario's failure is not a valid Red: ${redClass}`,
    evidence: `${where}: ${failure?.message ?? ""}`,
    next: NEXT[redClass],
  });
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
      evidence: turnedRed.map((scenario) => `${describeScenario(scenario)}: ${scenario.status}`).join("\n"),
      next: "Change the code so that these scenarios pass again, keeping the unit tests green",
    };
  }
  return undefined;
}

/** Accepts a test attempt only when every new test fails with a valid Red on the code it was written against (D-02). */
export async function judgeNewTests(
  worktreeDir: string,
  testFiles: string[],
  run: CommandRunner,
  symbolExists: (name: string) => boolean,
): Promise<Judgment> {
  const unit = await runUnitTests(worktreeDir, testFiles, run);
  if (!unit.ran) {
    return refused({
      failed: "The new tests did not run: not_run",
      evidence: unit.output,
      next: "Fix what stops vitest from loading these test files, such as a syntax error",
    });
  }
  const inFiles = (test: string): boolean => testFiles.some((file) => test === file || test.startsWith(`${file} > `));
  // A file counts as run only when one of its tests passed or failed, or the file itself failed to load.
  const reported = [...unit.passed, ...(unit.failures ?? []).map((failure) => failure.test)];
  const notRun = testFiles.filter((file) => !reported.some((test) => test === file || test.startsWith(`${file} > `)));
  if (notRun.length > 0) {
    return refused({
      failed: "New test files ran no test: not_run",
      evidence: notRun.join("\n"),
      next: NEXT.not_run,
    });
  }
  const passing = unit.passed.filter(inFiles);
  if (passing.length > 0) {
    return refused({
      failed: "New tests pass before their code exists: test_bug",
      evidence: passing.join("\n"),
      next: "Make each of these tests assert behaviour the code does not have yet",
    });
  }
  const classified = (unit.failures ?? [])
    .filter((failure) => inFiles(failure.test))
    .map((failure) => ({ ...failure, redClass: classifyFailure(failure.message, symbolExists) }));
  const invalid = classified.filter((failure) => !isValidRed(failure.redClass));
  if (invalid.length > 0) {
    return refused({
      failed: `New tests fail, but not with a valid Red: ${[...new Set(invalid.map((failure) => failure.redClass))].join(", ")}`,
      evidence: invalid.map((failure) => `${failure.test}: ${failure.redClass}: ${failure.message}`).join("\n"),
      next: NEXT[invalid[0]!.redClass],
    });
  }
  return accepted(classified.map((failure) => `${failure.test}: ${failure.redClass}`));
}

function describeScenario(scenario: Scenario): string {
  return `${scenario.uri}:${scenario.line} "${scenario.name}"`;
}
