import { rm } from "node:fs/promises";
import { WRITABLE } from "./boundaries.ts";
import { type CommandRunner, projectBin } from "./command.ts";
import { addedLines, scenarioCoverage, uncoveredNew, unitCoverage, untaken } from "./coverage.ts";
import type { ScenarioResult } from "./cucumber-messages.ts";
import type { AttemptKind } from "./executor.ts";
import type { Refusal } from "./refusal.ts";
import { git, reportPath } from "./git.ts";
import { runAllScenarios } from "./scenarios.ts";
import { runUnitTests } from "./unit-tests.ts";

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  /** The check ran no test, or checked no file: it fails whatever its runner's exit code (NFR-02). */
  ranNothing?: boolean;
  /** An option the runner does not know: the check could not run, which no attempt can fix. */
  unknownOption?: string;
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
export async function runGate(dir: string, run: CommandRunner, since?: { start: string }): Promise<CheckResult[]> {
  if (since === undefined) return [await typesCheck(dir, run), await unitCheck(dir, run), await scenariosCheck(dir, run)];
  const unitDir = await reportPath(dir, "oid-coverage-unit");
  const v8Dir = await reportPath(dir, "oid-coverage-scenarios");
  await rm(unitDir, { recursive: true, force: true });
  await rm(v8Dir, { recursive: true, force: true });
  const checks = [await typesCheck(dir, run), await unitCheck(dir, run, unitDir), await scenariosCheck(dir, run, v8Dir)];
  return [...checks, await coverageCheck(dir, since.start, unitDir, v8Dir)];
}

/** The branches the run added since `start` that no test runs, unit test or scenario, joined by place (FR-GATE-02). */
async function coverageCheck(dir: string, start: string, unitDir: string, v8Dir: string): Promise<CheckResult> {
  const unit = unitCoverage(unitDir);
  if (unit === undefined) return checkResult("coverage", { ran: false, ranNothing: false, output: "vitest wrote no coverage report", failures: [] });
  const added = addedLines(await git(dir, "diff", "-U0", "--no-color", start, "--", ...WRITABLE.code));
  const left = uncoveredNew(untaken([unit, await scenarioCoverage(v8Dir, dir, WRITABLE.code)], dir), added);
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

async function unitCheck(dir: string, run: CommandRunner, coverageDir?: string): Promise<CheckResult> {
  const unit = await runUnitTests(dir, [], run, coverageDir);
  const failures = (unit.failures ?? []).map((failure) => `${failure.test}: ${failure.message}`);
  const ranNothing = unit.ran && unit.passed.length === 0 && failures.length === 0;
  const result = checkResult("unit", { ran: unit.ran, ranNothing, output: unit.output, failures }, { failedTests: (unit.failures ?? []).map((failure) => failure.test) });
  return unit.ran ? { ...result, tests: unit.passed.length + failures.length } : result;
}

async function scenariosCheck(dir: string, run: CommandRunner, v8CoverageDir?: string): Promise<CheckResult> {
  const { ran, results, steps, output } = await runAllScenarios(dir, run, v8CoverageDir);
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
  const unknown = results.filter((result) => result.unknownOption !== undefined);
  if (unknown.length === 0) return undefined;
  return unknown
    .map((result) => `The ${result.name} check could not run: its runner does not know the option ${result.unknownOption}. Fix the project's configuration.`)
    .join("\n");
}

// What the attempt the gate sends back is told to do: its own kind's part, never another's (FR-GATE-04).
const NEXT_STEP: Record<AttemptKind, string> = {
  code: "Fix the code so that every check passes, without changing the tests or the scenarios",
  test: "Fix these errors in the unit tests, keeping what each test asserts",
  steps: "Fix these errors in the step definitions, keeping what each step asserts",
};

/** The gate's refusal: every failed check, with its failures, or its output when it has none, as the evidence; its next step is for the kind of attempt it goes back to. */
export function gateRefusal(results: CheckResult[], sendTo: AttemptKind = "code"): Refusal | undefined {
  const failed = results.filter((result) => !result.passed);
  if (failed.length === 0) return undefined;
  const scenarios = failed
    .flatMap((result) => result.failedScenarios ?? [])
    .map(({ uri, line, name, steps, failure }) => ({ uri, line, name, ...(steps === undefined ? {} : { steps }), ...(failure === undefined ? {} : { failure }) }));
  const tests = failed.flatMap((result) => result.failedTests ?? []);
  return {
    failed: `The gate failed: ${failed.map((result) => `${result.name}: ${result.ranNothing === true ? "FAIL, ran no test" : "FAIL"}`).join(", ")}`,
    evidence: failed.map((result) => `${result.name}:\n${result.failures?.join("\n") ?? result.output}`).join("\n"),
    next: NEXT_STEP[sendTo],
    ...(scenarios.length > 0 || tests.length > 0 ? { focus: { scenarios, tests } } : {}),
  };
}
