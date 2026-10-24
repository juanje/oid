import { type CommandRunner, projectBin } from "./command.ts";
import type { ScenarioResult } from "./cucumber-messages.ts";
import type { Refusal } from "./refusal.ts";
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
  /** The scenarios that fail, with where they are: what a code attempt after the gate must look at first. */
  failedScenarios?: ScenarioResult[];
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

/** Runs every check of the gate over the whole project in `dir`, with the project's own runners. */
export async function runGate(dir: string, run: CommandRunner): Promise<CheckResult[]> {
  return [await typesCheck(dir, run), await unitCheck(dir, run), await scenariosCheck(dir, run)];
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

async function unitCheck(dir: string, run: CommandRunner): Promise<CheckResult> {
  const unit = await runUnitTests(dir, [], run);
  const failures = (unit.failures ?? []).map((failure) => `${failure.test}: ${failure.message}`);
  const ranNothing = unit.ran && unit.passed.length === 0 && failures.length === 0;
  const result = checkResult("unit", { ran: unit.ran, ranNothing, output: unit.output, failures }, { failedTests: (unit.failures ?? []).map((failure) => failure.test) });
  return unit.ran ? { ...result, tests: unit.passed.length + failures.length } : result;
}

async function scenariosCheck(dir: string, run: CommandRunner): Promise<CheckResult> {
  const { ran, results, output } = await runAllScenarios(dir, run);
  const failedScenarios = results.filter((result) => result.status !== "passed");
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

/** The gate's refusal: every failed check, with its failures, or its output when it has none, as the evidence. */
export function gateRefusal(results: CheckResult[]): Refusal | undefined {
  const failed = results.filter((result) => !result.passed);
  if (failed.length === 0) return undefined;
  const scenarios = failed.flatMap((result) => result.failedScenarios ?? []).map(({ uri, line, name }) => ({ uri, line, name }));
  const tests = failed.flatMap((result) => result.failedTests ?? []);
  return {
    failed: `The gate failed: ${failed.map((result) => `${result.name}: ${result.ranNothing === true ? "FAIL, ran no test" : "FAIL"}`).join(", ")}`,
    evidence: failed.map((result) => `${result.name}:\n${result.failures?.join("\n") ?? result.output}`).join("\n"),
    next: "Fix the code so that every check passes, without changing the tests or the scenarios",
    ...(scenarios.length > 0 || tests.length > 0 ? { focus: { scenarios, tests } } : {}),
  };
}
