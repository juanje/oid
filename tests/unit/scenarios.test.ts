import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { describe, expect, test } from "vitest";
import type { CommandOptions, CommandResult } from "../../src/command.ts";
import { frScenarios, listScenarios, runAllScenarios, runScenarios } from "../../src/scenarios.ts";
import { GREET_02_FIRST as FIRST, GREET_02_SECOND as SECOND, recorded } from "./support/recorded.ts";
import { tempRepo } from "./support/repo.ts";

/** A cucumber-js that checks it was asked for `expected` arguments in `dir`, then writes `ndjson` as its message report. */
function recordedCucumber(dir: string, expected: string[], ndjson: string) {
  return async (command: string, args: string[], options: CommandOptions): Promise<CommandResult> => {
    expect(basename(command)).toBe("cucumber-js");
    expect(options.cwd).toBe(dir);
    expect(options.env?.NODE_OPTIONS).toBe("--import tsx");
    const format = args.indexOf("--format");
    expect(args[format + 1]).toMatch(/^message:/);
    expect(args.filter((_, index) => index !== format && index !== format + 1)).toEqual(expected);
    await writeFile(args[format + 1]!.slice("message:".length), ndjson);
    return { exitCode: 1, output: "" };
  };
}

describe("listScenarios", () => {
  test("asks cucumber-js for a dry run of the FR's tag and returns its scenarios in order", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = recordedCucumber(dir, ["--dry-run", "--tags", "@FR-GREET-02"], recorded("cucumber-greet-02-dry.ndjson"));

    expect(await listScenarios(dir, "FR-GREET-02", run)).toEqual([FIRST, SECOND]);
  });
  test("gives each scenario's steps from the same dry run, by where the scenario is", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = recordedCucumber(dir, ["--dry-run", "--tags", "@FR-GREET-02"], recorded("cucumber-greet-02-dry.ndjson"));

    const { scenarios, steps } = await frScenarios(dir, "FR-GREET-02", run);

    expect(scenarios).toEqual([FIRST, SECOND]);
    expect(steps.get(`${SECOND.uri}:${SECOND.line}`)).toEqual(['When I greet "Ada", "Grace" and "Linus"', 'Then I get "Hello, Ada, Grace and Linus!"']);
  });
});

describe("runScenarios", () => {
  test("runs the scenarios by location and returns each one's result, with the step a failed one failed at", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = recordedCucumber(dir, ["features/greet-02.feature:4", "features/greet-02.feature:8"], recorded("cucumber-greet-02-run.ndjson"));

    expect(await runScenarios(dir, [FIRST, SECOND], run)).toEqual([
      { ...FIRST, status: "passed" },
      {
        ...SECOND,
        status: "failed",
        failure: { step: 'I greet "Ada", "Grace" and "Linus"', kind: "Action", status: "UNDEFINED", message: "" },
      },
    ]);
  });

  test("never reads a report left by an earlier run when cucumber stops before writing one", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const location = ["features/greet-02.feature:4"];
    await runScenarios(dir, [FIRST], recordedCucumber(dir, location, recorded("cucumber-greet-02-run.ndjson")));
    // A step file that imports a missing module stops cucumber-js before any scenario runs, and it writes no report.
    const stopsOnLoad = async (): Promise<CommandResult> => ({ exitCode: 1, output: "Error [ERR_MODULE_NOT_FOUND]" });

    expect(await runScenarios(dir, [FIRST], stopsOnLoad)).toEqual([{ ...FIRST, status: "not run" }]);
  });

  test("fails a scenario that did not finish when cucumber-js was stopped at the time limit, saying so", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const cut = recorded("cucumber-greet-02-run.ndjson").trimEnd().split("\n").slice(0, 7).join("\n");
    const recordedRun = recordedCucumber(dir, ["features/greet-02.feature:4"], cut);
    const stopped = async (command: string, args: string[], options: CommandOptions): Promise<CommandResult> => ({ ...(await recordedRun(command, args, options)), stoppedAfter: 5 });

    const [result] = await runScenarios(dir, [FIRST], stopped);

    expect(result).toMatchObject({ ...FIRST, status: "failed", failure: { step: 'I get "Hello, Ada and Grace!"', message: "did not finish within 5 s" } });
  });

  test("reports a scenario it asked for that did not run as not run", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const missing = { uri: "features/greet-02.feature", line: 12, name: "A scenario that is not there" };
    const run = recordedCucumber(dir, ["features/greet-02.feature:4", "features/greet-02.feature:12"], recorded("cucumber-greet-02-run.ndjson"));

    expect(await runScenarios(dir, [FIRST, missing], run)).toEqual([
      { ...FIRST, status: "passed" },
      { ...missing, status: "not run" },
    ]);
  });
});

describe("runAllScenarios", () => {
  test("given locations, keeps only their results, whatever cucumber-js ran: a configuration with paths runs them all", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    // The recording holds both scenarios of FR-GREET-02, as cucumber-js runs them when its configuration names paths.
    const run = recordedCucumber(dir, ["features/greet-02.feature:4"], recorded("cucumber-greet-02-run.ndjson"));

    const { results, steps } = await runAllScenarios(dir, run, undefined, ["features/greet-02.feature:4"]);

    expect({ results, steps: [...steps.keys()] }).toEqual({ results: [{ ...FIRST, status: "passed" }], steps: ["features/greet-02.feature:4"] });
  });
});
