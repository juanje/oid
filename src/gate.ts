import { type CommandRunner, projectBin, TYPESCRIPT_STEPS_ENV } from "./command.ts";
import type { Refusal } from "./refusal.ts";

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  /** The check ran no test, or checked no file: it fails whatever its runner's exit code (NFR-02). */
  ranNothing?: boolean;
  /** An option the runner does not know: the check could not run, which no attempt can fix. */
  unknownOption?: string;
}

interface Check {
  name: string;
  bin: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  /** What the runner says when it ran nothing, as the pinned versions word it. */
  ranNothing: RegExp;
}

const CHECKS: Check[] = [
  { name: "types", bin: "tsc", args: ["--noEmit"], ranNothing: /error TS18003: No inputs were found/ },
  { name: "unit", bin: "vitest", args: ["run"], ranNothing: /No test files found/ },
  { name: "scenarios", bin: "cucumber-js", args: [], env: TYPESCRIPT_STEPS_ENV, ranNothing: /^0 scenarios$/m },
];

// How the runners name an option they do not know: tsc's TS5023, and the usual "unknown option" of CLIs.
const UNKNOWN_OPTION = [/error TS5023: Unknown compiler option '([^']+)'/, /unknown option:? ['"`]?(-{1,2}[\w-]+)/i];

/** Runs every check of the gate over the whole project in `dir`, with the project's own runners. */
export async function runGate(dir: string, run: CommandRunner): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of CHECKS) {
    const env = check.env === undefined ? undefined : { ...process.env, ...check.env };
    const { exitCode, output } = await run(projectBin(dir, check.bin), check.args, { cwd: dir, env });
    const ranNothing = check.ranNothing.test(output);
    const unknownOption = UNKNOWN_OPTION.map((pattern) => pattern.exec(output)?.[1]).find((option) => option !== undefined);
    results.push({
      name: check.name,
      passed: exitCode === 0 && !ranNothing && unknownOption === undefined,
      output,
      ...(ranNothing ? { ranNothing } : {}),
      ...(unknownOption === undefined ? {} : { unknownOption }),
    });
  }
  return results;
}

/** The gate's error: a check whose runner does not know an option could not run, and no attempt can fix that. */
export function gateError(results: CheckResult[]): string | undefined {
  const unknown = results.filter((result) => result.unknownOption !== undefined);
  if (unknown.length === 0) return undefined;
  return unknown
    .map((result) => `The ${result.name} check could not run: its runner does not know the option ${result.unknownOption}. Fix the project's configuration.`)
    .join("\n");
}

/** The gate's refusal: every failed check, with its output as the evidence. */
export function gateRefusal(results: CheckResult[]): Refusal | undefined {
  const failed = results.filter((result) => !result.passed);
  if (failed.length === 0) return undefined;
  return {
    failed: `The gate failed: ${failed.map((result) => `${result.name}: ${result.ranNothing === true ? "FAIL, ran no test" : "FAIL"}`).join(", ")}`,
    evidence: failed.map((result) => `${result.name}:\n${result.output}`).join("\n"),
    next: "Fix the code so that every check passes, without changing the tests or the scenarios",
  };
}
