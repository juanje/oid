import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandRunner } from "./command.ts";
import { type Scenario, scenarioResults, scenariosIn } from "./cucumber-messages.ts";
import { git } from "./git.ts";

export interface ScenarioRun extends Scenario {
  status: "passed" | "failed" | "not run";
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
    return { ...scenario, status: result?.status ?? "not run" };
  });
}

function location(scenario: Scenario): string {
  return `${scenario.uri}:${scenario.line}`;
}

/** Runs the project's cucumber-js and reads its message report; a load error stops cucumber before it writes one. */
async function cucumber(dir: string, args: string[], run: CommandRunner): Promise<{ report: string | undefined; output: string }> {
  // The report goes to the worktree's own git directory, out of the project's files.
  const reportFile = join(await git(dir, "rev-parse", "--absolute-git-dir"), "oid-scenarios.ndjson");
  const { output } = await run(join(dir, "node_modules/.bin/cucumber-js"), [...args, "--format", `message:${reportFile}`], {
    cwd: dir,
    // cucumber-js loads TypeScript step definitions only through tsx.
    env: { ...process.env, NODE_OPTIONS: "--import tsx" },
  });
  return { report: existsSync(reportFile) ? await readFile(reportFile, "utf8") : undefined, output };
}
