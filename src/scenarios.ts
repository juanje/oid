import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { type CommandRunner, projectBin, TYPESCRIPT_STEPS_ENV } from "./command.ts";
import { type Scenario, type StepFailure, scenarioResults, scenariosIn } from "./cucumber-messages.ts";
import { reportPath } from "./git.ts";

export interface ScenarioRun extends Scenario {
  status: "passed" | "failed" | "not run";
  failure?: StepFailure;
}

/** The scenarios tagged with the FR, in cucumber's order, from a dry run with the project's own cucumber config. */
export async function listScenarios(dir: string, fr: string, run: CommandRunner): Promise<Scenario[]> {
  const { report, output } = await cucumber(dir, ["--dry-run", "--tags", `@${fr}`], run);
  if (report === undefined) throw new Error(`cucumber-js listed no scenarios for ${fr}:\n${output}`);
  return scenariosIn(report);
}

/** Runs the scenarios by location. A scenario asked for that did not run is "not run", never passed. */
export async function runScenarios(dir: string, scenarios: Scenario[], run: CommandRunner): Promise<ScenarioRun[]> {
  const { report } = await cucumber(dir, scenarios.map(location), run);
  const results = report === undefined ? [] : scenarioResults(report);
  return scenarios.map((scenario) => {
    const result = results.find((ran) => location(ran) === location(scenario));
    return result === undefined ? { ...scenario, status: "not run" } : { ...scenario, status: result.status, failure: result.failure };
  });
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
