import type { CommandRunner } from "./command.ts";
import { NO_DEFINITION, type Scenario } from "./cucumber-messages.ts";
import { classifyFailure, classifyScenario, isValidRed, type RedClass } from "./red-class.ts";
import type { Refusal } from "./refusal.ts";
import type { ScenarioRun } from "./scenarios.ts";
import { isInFile, runUnitTests, testsIn, type UnitRun } from "./unit-tests.ts";

/** An attempt's evidence: a refusal, or the valid Reds it showed, each as `<what failed>: <class>`. */
export interface Judgment {
  refusal: Refusal | undefined;
  reds: string[];
}

const accepted = (reds: string[]): Judgment => ({ refusal: undefined, reds });

// A failure oid cannot classify is accepted, and the code confirms or refutes it (D-02).
const PROVISIONAL = ": undecided (provisional)";

/** A Red as the run records it: `<what failed>: <class>`, marked provisional when oid cannot classify the failure. */
function red(what: string, redClass: RedClass): string {
  return redClass === "undecided" ? `${what}${PROVISIONAL}` : `${what}: ${redClass}`;
}

/** What failed, for each of `reds` that is provisional. */
export function provisionalOf(reds: string[]): string[] {
  return reds.filter((one) => one.endsWith(PROVISIONAL)).map((one) => one.slice(0, -PROVISIONAL.length));
}

/** Whether a failure of this class is accepted: as a valid Red, or provisionally when oid cannot classify it. */
function isAccepted(redClass: RedClass): boolean {
  return isValidRed(redClass) || redClass === "undecided";
}
const refused = (refusal: Refusal): Judgment => ({ refusal, reds: [] });

// What the agent can do about a failure that is not a valid Red, by its class.
const NEXT: Record<RedClass, string> = {
  business_assertion: "",
  missing_implementation: "",
  test_bug: "Fix the test itself so that it runs and fails only because the behaviour is missing",
  environment: "Use only what the project already has installed; the gate's configuration, package.json included, is not yours to change",
  not_run: "Put the test where the runner collects it, and check that it loads",
  undecided: "",
};

/** Accepts a steps attempt only when its scenario ran and failed with a valid Red (D-02). */
export function judgeSteps(result: ScenarioRun, symbolExists: (name: string) => boolean, { offerMutant = false }: { offerMutant?: boolean } = {}): Judgment {
  const scenario = describeScenario(result);
  if (result.status === "passed") {
    const next = "Make the step definitions call the code under test and assert the outcome the scenario states";
    return refused({
      failed: "The scenario passes before its code exists: test_bug",
      evidence: `${scenario} passed with the new step definitions alone`,
      next: offerMutant ? `${next}; when the code already has that behaviour, submit a mutant in your report instead` : next,
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
  if (isAccepted(redClass)) return accepted([red(scenario, redClass)]);
  const failure = result.failure;
  const where = `${scenario}, step "${failure?.step ?? "?"}"`;
  if (failure?.kind === "Context") {
    return refused({
      failed: `The scenario fails while being set up, in a Given or Background step: ${redClass}`,
      evidence: `${where}: ${failure.message}`,
      next: "Set the scenario up without code that does not exist yet, or move that behaviour into a When or Then step",
    });
  }
  if (failure !== undefined && NO_DEFINITION.has(failure.status)) {
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
const NO_TEST_SUITE = /^No test suite found in file /;

/** The test files that register no vitest test: not tests there are, so a test attempt that rewrites one adds new tests. */
export function noTestSuiteFiles(unit: UnitRun): string[] {
  return (unit.failures ?? []).filter((failure) => NO_TEST_SUITE.test(failure.message)).map((failure) => failure.test);
}

export function judgeCode(unit: UnitRun, greenScenarios: ScenarioRun[]): Refusal | undefined {
  if (!unit.ran) {
    return {
      failed: "The unit suite did not run",
      evidence: unit.output,
      next: "Fix what stops vitest from loading the suite, such as a syntax error in the source",
    };
  }
  // A test file that registers no vitest test is the test attempt's test_bug, which no code can fix (DOMAIN.md, vitest).
  const noSuite = (unit.failures ?? []).filter((failure) => NO_TEST_SUITE.test(failure.message));
  if (noSuite.length > 0) {
    return {
      failed: `${noSuite.map((failure) => failure.test).join(", ")} defines no vitest test: test_bug`,
      evidence: noSuite.map((failure) => `${failure.test}: ${failure.message}`).join("\n"),
      next: 'Write the tests with vitest: describe, it and test, imported from "vitest"',
      sendTo: "test",
    };
  }
  if (unit.failed.length > 0) {
    return {
      failed: "Unit tests fail after the code",
      // Each failing test with its message: a retry needs to see why it fails, not only that it does.
      evidence: (unit.failures?.map((failure) => `${failure.test}: ${failure.message}`) ?? unit.failed).join("\n"),
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

/**
 * Accepts a test attempt only when every new test fails with a valid Red on the code it was written against (D-02).
 * A test is new when it is in a file the attempt changed and not in `known`, the tests there were before the attempt.
 */
export async function judgeNewTests(
  worktreeDir: string,
  testFiles: string[],
  run: CommandRunner,
  symbolExists: (name: string, file: string) => boolean,
  known: Set<string>,
  { offerMutant = false, underMutant }: { offerMutant?: boolean; underMutant?: (passing: string[]) => Promise<{ reds: string[] } | { refusal: Refusal }> } = {},
): Promise<Judgment> {
  const unit = await runUnitTests(worktreeDir, testFiles, run);
  if (!unit.ran) {
    return refused({
      failed: "The new tests did not run: not_run",
      evidence: unit.output,
      next: "Fix what stops vitest from loading these test files, such as a syntax error",
    });
  }
  const inFiles = (test: string): boolean => testFiles.some((file) => isInFile(test, file));
  // A file counts as run only when one of its tests passed or failed, or the file itself failed to load.
  const reported = [...testsIn(unit)];
  const notRun = testFiles.filter((file) => !reported.some((test) => isInFile(test, file)));
  if (notRun.length > 0) {
    return refused({
      failed: "New test files ran no test: not_run",
      evidence: notRun.join("\n"),
      next: NEXT.not_run,
    });
  }
  const isNew = (test: string): boolean => inFiles(test) && !known.has(test);
  const passing = unit.passed.filter(isNew);
  // New tests that pass before their code count only through a mutant they fail on (FR-EVID-03).
  const proved = passing.length > 0 && underMutant !== undefined ? await underMutant(passing) : undefined;
  if (proved !== undefined && "refusal" in proved) return refused(proved.refusal);
  if (passing.length > 0 && proved === undefined) {
    const next = "Make each of these tests assert behaviour the code does not have yet";
    return refused({
      failed: "New tests pass before their code exists: test_bug",
      evidence: passing.join("\n"),
      next: offerMutant ? `${next}; when the code already has it, submit a mutant in your report instead` : next,
    });
  }
  const classified = (unit.failures ?? [])
    .filter((failure) => isNew(failure.test))
    .map((failure) => {
      // A name exists or not as the failing test's own file imports it.
      const file = failure.test.split(" > ")[0]!;
      return { ...failure, redClass: classifyFailure(failure.message, (name) => symbolExists(name, file)) };
    });
  const invalid = classified.filter((failure) => !isAccepted(failure.redClass));
  if (invalid.length > 0) {
    return refused({
      failed: `New tests fail, but not with a valid Red: ${[...new Set(invalid.map((failure) => failure.redClass))].join(", ")}`,
      evidence: invalid.map((failure) => `${failure.test}: ${failure.redClass}: ${failure.message}`).join("\n"),
      next: NEXT[invalid[0]!.redClass],
    });
  }
  return accepted([...classified.map((failure) => red(failure.test, failure.redClass)), ...(proved?.reds ?? [])]);
}

function describeScenario(scenario: Scenario): string {
  return `${scenario.uri}:${scenario.line} "${scenario.name}"`;
}
