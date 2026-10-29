import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { type CommandRunner, didNotFinish, projectBin, TYPESCRIPT_STEPS_ENV } from "./command.ts";
import { type Scenario, type ScenarioResult, type StepFailure, scenarioResults, scenarioSteps, scenariosIn } from "./cucumber-messages.ts";
import { reportPath } from "./git.ts";
import { RUNNERS } from "./runners.ts";

export interface ScenarioRun extends Scenario {
  status: "passed" | "failed" | "not run";
  failure?: StepFailure;
  /** The files that define its steps, when it ran and any step has a definition. */
  stepFiles?: string[];
}

/** The scenarios tagged with the FR, in cucumber's order, from a dry run with the project's own cucumber config. */
export async function listScenarios(dir: string, fr: string, run: CommandRunner): Promise<Scenario[]> {
  return (await frScenarios(dir, fr, run)).scenarios;
}

/** The FR's scenarios, and each one's steps by `<uri>:<line>`, from one dry run. */
export async function frScenarios(dir: string, fr: string, run: CommandRunner): Promise<{ scenarios: Scenario[]; steps: Map<string, string[]> }> {
  const { report, output } = await cucumber(dir, ["--dry-run", "--tags", `@${fr}`], run);
  if (report === undefined) throw new Error(`cucumber-js listed no scenarios for ${fr}:\n${output}`);
  return { scenarios: scenariosIn(report), steps: scenarioSteps(report) };
}

/** Runs the scenarios by location. A scenario asked for that did not run is "not run", never passed. */
export async function runScenarios(dir: string, scenarios: Scenario[], run: CommandRunner): Promise<ScenarioRun[]> {
  const { report, stoppedAfter } = await cucumber(dir, scenarios.map(location), run);
  const results = report === undefined ? [] : withStop(scenarioResults(report), stoppedAfter);
  return scenarios.map((scenario) => {
    const result = results.find((ran) => location(ran) === location(scenario));
    if (result === undefined) return { ...scenario, status: "not run" };
    return { ...scenario, status: result.status, failure: result.failure, ...(result.stepFiles === undefined ? {} : { stepFiles: result.stepFiles }) };
  });
}

/**
 * Runs every scenario the project's cucumber-js config finds, as the gate does, with each one's steps by `<uri>:<line>`.
 * `ran` is false when cucumber wrote no report.
 */
export async function runAllScenarios(
  dir: string,
  run: CommandRunner,
  v8CoverageDir?: string,
  locations: string[] = [],
  env: Record<string, string> = {},
): Promise<{ ran: boolean; results: ScenarioResult[]; steps: Map<string, string[]>; output: string }> {
  // With a coverage dir, Node writes the V8 coverage of every process cucumber-js runs there (FR-GATE-02). Given
  // locations, it runs only those scenarios: the gate's scope (FR-GATE-01).
  const { report, output, stoppedAfter } = await cucumber(dir, locations, run, v8CoverageDir === undefined ? env : { NODE_V8_COVERAGE: v8CoverageDir, ...env });
  if (report === undefined) return { ran: false, results: [], steps: new Map(), output };
  // A configuration that names paths runs them all, whatever locations it is given (DOMAIN.md, cucumber-js): only the
  // scenarios asked for count.
  const asked = locations.length === 0 ? undefined : new Set(locations);
  const results = withStop(scenarioResults(report), stoppedAfter).filter((result) => asked === undefined || asked.has(location(result)));
  const steps = new Map([...scenarioSteps(report)].filter(([where]) => asked === undefined || asked.has(where)));
  return { ran: true, results, steps, output };
}

/** A scenario that did not finish says it was stopped at the time limit (FR-RUN-09). */
function withStop(results: ScenarioResult[], stoppedAfter: number | undefined): ScenarioResult[] {
  if (stoppedAfter === undefined) return results;
  return results.map((result) => (result.failure?.status === "NOT FINISHED" ? { ...result, failure: { ...result.failure, message: didNotFinish(stoppedAfter) } } : result));
}

function location(scenario: Scenario): string {
  return `${scenario.uri}:${scenario.line}`;
}

/** Runs the project's cucumber-js and reads its message report; a load error stops cucumber before it writes one. */
async function cucumber(dir: string, args: string[], run: CommandRunner, env: Record<string, string> = {}): Promise<{ report: string | undefined; output: string; stoppedAfter?: number }> {
  const reportFile = await reportPath(dir, "oid-scenarios.ndjson");
  await rm(reportFile, { force: true });
  const { output, stoppedAfter } = await run(projectBin(dir, RUNNERS.scenarios.bin), [...args, "--format", `message:${reportFile}`], {
    cwd: dir,
    env: { ...process.env, ...TYPESCRIPT_STEPS_ENV, ...env },
  });
  return { report: existsSync(reportFile) ? await readFile(reportFile, "utf8") : undefined, output, ...(stoppedAfter === undefined ? {} : { stoppedAfter }) };
}
