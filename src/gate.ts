import { rm } from "node:fs/promises";
import { type CommandRunner, TYPESCRIPT_STEPS_ENV, projectBin } from "./command.ts";
import { type CoverageReport, addedLines, scenarioCoverage, uncoveredNew, unitCoverage, untaken } from "./coverage.ts";
import type { ScenarioResult } from "./cucumber-messages.ts";
import type { PathsKind } from "./executor.ts";
import type { Refusal } from "./refusal.ts";
import { git, reportPath } from "./git.ts";
import { runAllScenarios } from "./scenarios.ts";
import { SOURCE_CAPTURE, sourceCaptureEnv } from "./source-capture.ts";
import { runUnitTests } from "./unit-tests.ts";
import type { VitestDialect } from "./vitest-dialect.ts";

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  /** The check ran no test, or checked no file: it fails whatever its runner's exit code (NFR-02). */
  ranNothing?: boolean;
  /** An option the runner does not know: the check could not run, which no attempt can fix. */
  unknownOption?: string;
  /** Why the check could not read what its runner wrote, which no attempt can fix either. */
  error?: string;
  /** Each failing test or scenario with its message, from the runner's report. */
  failures?: string[];
  /** The failing tests, as `<file> > <full name>`. */
  failedTests?: string[];
  /** The scenarios that fail, with where they are and their steps: what a code attempt after the gate must look at first. */
  failedScenarios?: (ScenarioResult & { steps?: string[] })[];
  /** The files the type errors are in, each once: their owners fix them (FR-GATE-04). */
  failedFiles?: string[];
  /** How many tests the unit check ran, passing or failing: an attempt the gate sent back must not drop any. */
  tests?: number;
}

// How the runners name an option they do not know: tsc's TS5023, and the usual "unknown option" of CLIs.
const UNKNOWN_OPTION = [/error TS5023: Unknown compiler option '([^']+)'/, /unknown option:? ['"`]?(-{1,2}[\w-]+)/i];

function unknownOptionIn(output: string): { unknownOption?: string } {
  const option = UNKNOWN_OPTION.map((pattern) => pattern.exec(output)?.[1]).find((found) => found !== undefined);
  return option === undefined ? {} : { unknownOption: option };
}

/**
 * Runs every check of the gate over the whole project in `dir`, with the project's own runners. Given the commit a run
 * started from, it also checks the coverage of the branches the run added (FR-GATE-02).
 */
export async function runGate(
  dir: string,
  run: CommandRunner,
  since?: { start: string; scenarios?: string[]; source: string[]; vitest: VitestDialect },
): Promise<CheckResult[]> {
  if (since === undefined) return [await typesCheck(dir, run), await unitCheck(dir, run), await scenariosCheck(dir, run)];
  const unitDir = await reportPath(dir, "oid-coverage-unit");
  const v8Dir = await reportPath(dir, "oid-coverage-scenarios");
  await rm(unitDir, { recursive: true, force: true });
  await rm(v8Dir, { recursive: true, force: true });
  const checks = [await typesCheck(dir, run), await unitCheck(dir, run, { dir: unitDir, source: since.source }), await scenariosCheck(dir, run, v8Dir, since.scenarios, scenarioCoverageEnv(v8Dir, since))];
  return [...checks, await coverageCheck(dir, since, unitDir, v8Dir)];
}

/**
 * On vitest 5, cucumber-js also runs the hook that keeps the code tsx gives Node, which mapping the scenarios' coverage
 * as vitest maps the unit tests' needs (DOMAIN.md, vitest's coverage).
 */
function scenarioCoverageEnv(v8Dir: string, { source, vitest }: { source: string[]; vitest: VitestDialect }): Record<string, string> {
  if (vitest !== 5) return {};
  return { NODE_OPTIONS: `${TYPESCRIPT_STEPS_ENV.NODE_OPTIONS} --import "${SOURCE_CAPTURE}"`, ...sourceCaptureEnv(v8Dir, source) };
}

/** The branches the run added since `start` that no test runs, unit test or scenario, joined by place (FR-GATE-02). */
async function coverageCheck(dir: string, { start, source, vitest }: { start: string; source: string[]; vitest: VitestDialect }, unitDir: string, v8Dir: string): Promise<CheckResult> {
  const unit = unitCoverage(unitDir);
  if (unit === undefined) return checkResult("coverage", { ran: false, ranNothing: false, output: "vitest wrote no coverage report", failures: [] });
  const added = addedLines(await git(dir, "diff", "-U0", "--no-color", start, "--", ...source));
  let scenarios: CoverageReport;
  try {
    scenarios = await scenarioCoverage(v8Dir, dir, source, vitest);
  } catch (error) {
    return { name: "coverage", passed: false, output: "", error: (error as Error).message };
  }
  const left = uncoveredNew(untaken([unit, scenarios], dir, vitest), added);
  const failures = left.map((item) => `${item.file}:${item.line}:${item.column + 1}: ${item.what}`);
  return checkResult("coverage", { ran: true, ranNothing: false, output: failures.join("\n"), failures });
}

interface Outcome {
  /** False when the runner wrote no report: nothing it says counts. */
  ran: boolean;
  ranNothing: boolean;
  output: string;
  failures: string[];
}

/** A check passes only when its runner ran, ran something, knew every option and reported no failure (NFR-02). */
function checkResult(name: string, outcome: Outcome, failedOnes: Partial<CheckResult> = {}): CheckResult {
  const unknown = unknownOptionIn(outcome.output);
  const failing = outcome.failures.length > 0;
  return {
    name,
    passed: outcome.ran && !outcome.ranNothing && !failing && unknown.unknownOption === undefined,
    output: outcome.output,
    ...(outcome.ranNothing ? { ranNothing: true } : {}),
    ...unknown,
    ...(failing ? { failures: outcome.failures, ...failedOnes } : {}),
  };
}

async function typesCheck(dir: string, run: CommandRunner): Promise<CheckResult> {
  const { exitCode, output } = await run(projectBin(dir, "tsc"), ["--noEmit"], { cwd: dir });
  const ranNothing = /error TS18003: No inputs were found/.test(output);
  const failing = exitCode !== 0 && !ranNothing;
  return checkResult("types", { ran: true, ranNothing, output, failures: failing ? [output.trim()] : [] }, { failedFiles: typeErrorFiles(output) });
}

/** The files of tsc's `<file>(<line>,<column>): error TS<code>` lines, each once, in order. */
function typeErrorFiles(output: string): string[] {
  return [...new Set([...output.matchAll(/^(\S[^(\n]*)\(\d+,\d+\): error TS\d+/gm)].map((match) => match[1]!))];
}

async function unitCheck(dir: string, run: CommandRunner, coverage?: { dir: string; source: string[] }): Promise<CheckResult> {
  const unit = await runUnitTests(dir, [], run, coverage);
  const failures = (unit.failures ?? []).map((failure) => `${failure.test}: ${failure.message}`);
  const ranNothing = unit.ran && unit.passed.length === 0 && failures.length === 0;
  const result = checkResult("unit", { ran: unit.ran, ranNothing, output: unit.output, failures }, { failedTests: (unit.failures ?? []).map((failure) => failure.test) });
  return unit.ran ? { ...result, tests: unit.passed.length + failures.length } : result;
}

async function scenariosCheck(dir: string, run: CommandRunner, v8CoverageDir?: string, scope?: string[], env: Record<string, string> = {}): Promise<CheckResult> {
  const { ran, results, steps, output } = await runAllScenarios(dir, run, v8CoverageDir, scope, env);
  const failedScenarios = results
    .filter((result) => result.status !== "passed")
    .map((result) => {
      const scenarioSteps = steps.get(`${result.uri}:${result.line}`);
      return scenarioSteps === undefined ? result : { ...result, steps: scenarioSteps };
    });
  const failures = failedScenarios.map(
    (scenario) => `${scenario.uri}:${scenario.line} "${scenario.name}", step "${scenario.failure?.step ?? "?"}": ${scenario.failure?.message ?? scenario.failure?.status ?? ""}`,
  );
  return checkResult("scenarios", { ran, ranNothing: ran && results.length === 0, output, failures }, { failedScenarios });
}

/** The gate's error: a check whose runner does not know an option could not run, and no attempt can fix that. */
export function gateError(results: CheckResult[]): string | undefined {
  const errors = results.flatMap((result) => {
    if (result.unknownOption !== undefined) return [`The ${result.name} check could not run: its runner does not know the option ${result.unknownOption}. Fix the project's configuration.`];
    return result.error === undefined ? [] : [`The ${result.name} check could not read what its runner wrote: ${result.error}`];
  });
  return errors.length === 0 ? undefined : errors.join("\n");
}

// What the attempt the gate sends back is told to do: its own kind's part, never another's (FR-GATE-04).
// The gate sends work back to a kind that owns files; a cleanup (refactor-code) is never one of them.
const NEXT_STEP: Record<PathsKind, string> = {
  code: "Fix the code so that every check passes, without changing the tests or the scenarios",
  test: "Fix these errors in the unit tests, keeping what each test asserts",
  steps: "Fix these errors in the step definitions, keeping what each step asserts",
};

// A test attempt sent back for branches no test runs: a branch a requirement states gets its test, one none states goes
// to a code attempt with the report that says so (FR-GATE-02).
const COVER_NEXT =
  "For each branch, if the SPEC or the FR's scenarios state what it does, add a unit test that takes it and submit in your report a mutant of the branch on which that test fails; if no requirement asks for a branch, add no test for it and say why in your report";

/**
 * A test attempt sent for uncovered branches, refused when a branch it was sent for is still untaken by every test,
 * after it (FR-GATE-02): a test of something else leaves the gap where it was.
 */
export function untakenRefusal(sent: string[], results: CheckResult[]): Refusal | undefined {
  const untaken = new Set(results.find((result) => result.name === "coverage")?.failures ?? []);
  const left = sent.filter((branch) => untaken.has(branch));
  if (left.length === 0) return undefined;
  return {
    failed: "The branches the test attempt was sent for are still untaken: its tests do not take them",
    evidence: left.join("\n"),
    next: COVER_NEXT,
    uncovered: left,
  };
}

/** The gate's refusal: every failed check, with its failures, or its output when it has none, as the evidence; its next step is for the kind of attempt it goes back to. */
export function gateRefusal(results: CheckResult[], sendTo: PathsKind = "code"): Refusal | undefined {
  const failed = results.filter((result) => !result.passed);
  if (failed.length === 0) return undefined;
  const uncovered = failed.find((result) => result.name === "coverage")?.failures ?? [];
  const scenarios = failed
    .flatMap((result) => result.failedScenarios ?? [])
    .map(({ uri, line, name, steps, failure }) => ({ uri, line, name, ...(steps === undefined ? {} : { steps }), ...(failure === undefined ? {} : { failure }) }));
  const tests = failed.flatMap((result) => result.failedTests ?? []);
  return {
    from: "gate",
    failed: `The gate failed: ${failed.map((result) => `${result.name}: ${result.ranNothing === true ? "FAIL, ran no test" : "FAIL"}`).join(", ")}`,
    evidence: failed.map((result) => `${result.name}:\n${result.failures?.join("\n") ?? result.output}`).join("\n"),
    next: sendTo === "test" && uncovered.length > 0 ? COVER_NEXT : NEXT_STEP[sendTo],
    ...(scenarios.length > 0 || tests.length > 0 ? { focus: { scenarios, tests } } : {}),
    ...(uncovered.length > 0 ? { uncovered } : {}),
  };
}
