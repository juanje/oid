import { type CommandRunner, projectBin, TYPESCRIPT_STEPS_ENV } from "./command.ts";
import type { Refusal } from "./refusal.ts";

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
}

interface Check {
  name: string;
  bin: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

const CHECKS: Check[] = [
  { name: "types", bin: "tsc", args: ["--noEmit"] },
  { name: "unit", bin: "vitest", args: ["run"] },
  { name: "scenarios", bin: "cucumber-js", args: [], env: TYPESCRIPT_STEPS_ENV },
];

/** Runs every check of the gate over the whole project in `dir`, with the project's own runners. */
export async function runGate(dir: string, run: CommandRunner): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of CHECKS) {
    const env = check.env === undefined ? undefined : { ...process.env, ...check.env };
    const { exitCode, output } = await run(projectBin(dir, check.bin), check.args, { cwd: dir, env });
    results.push({ name: check.name, passed: exitCode === 0, output });
  }
  return results;
}

/** The gate's refusal: every failed check, with its output as the evidence. */
export function gateRefusal(results: CheckResult[]): Refusal | undefined {
  const failed = results.filter((result) => !result.passed);
  if (failed.length === 0) return undefined;
  return {
    failed: `The gate failed: ${failed.map((result) => `${result.name}: FAIL`).join(", ")}`,
    evidence: failed.map((result) => `${result.name}:\n${result.output}`).join("\n"),
    next: "Fix the code so that every check passes, without changing the tests or the scenarios",
  };
}
