import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { type CommandRunner, projectBin, TYPESCRIPT_STEPS_ENV } from "./command.ts";
import { type Scenario, type ScenarioResult, type StepFailure, scenarioResults, scenarioSteps, scenariosIn } from "./cucumber-messages.ts";
import { reportPath } from "./git.ts";

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
  const { report } = await cucumber(dir, scenarios.map(location), run);
  const results = report === undefined ? [] : scenarioResults(report);
  return scenarios.map((scenario) => {
    const result = results.find((ran) => location(ran) === location(scenario));
    if (result === undefined) return { ...scenario, status: "not run" };
    return { ...scenario, status: result.status, failure: result.failure, ...(result.stepFiles === undefined ? {} : { stepFiles: result.stepFiles }) };
  });
}

/** Runs every scenario the project's cucumber-js config finds, as the gate does. `ran` is false when cucumber wrote no report. */
export async function runAllScenarios(dir: string, run: CommandRunner): Promise<{ ran: boolean; results: ScenarioResult[]; output: string }> {
  const { report, output } = await cucumber(dir, [], run);
  return { ran: report !== undefined, results: report === undefined ? [] : scenarioResults(report), output };
}

function location(scenario: Scenario): string {
  return `${scenario.uri}:${scenario.line}`;
}

/** Runs the project's cucumber-js and reads its message report; a load error stops cucumber before it writes one. */
async function cucumber(dir: string, args: string[], run: CommandRunner): Promise<{ report: string | undefined; output: string }> {
  const reportFile = await reportPath(dir, "oid-scenarios.ndjson");
  await rm(reportFile, { force: true });
  const { output } = await run(projectBin(dir, "cucumber-js"), [...args, "--format", `message:${reportFile}`], {
    cwd: dir,
    env: { ...process.env, ...TYPESCRIPT_STEPS_ENV },
  });
  return { report: existsSync(reportFile) ? await readFile(reportFile, "utf8") : undefined, output };
}
