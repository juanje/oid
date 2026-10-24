import { basename } from "node:path";
import { describe, expect, test } from "vitest";
import type { CommandResult } from "../../src/command.ts";
import { gateError, gateRefusal, runGate } from "../../src/gate.ts";

const TYPE_ERROR = "src/a.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.";

// The request each runner answers: its arguments, and what it needs from the environment.
const REQUESTS: Record<string, (args: string[], env: NodeJS.ProcessEnv | undefined) => void> = {
  tsc: (args) => expect(args).toEqual(["--noEmit"]),
  vitest: (args) => expect(args).toEqual(["run"]),
  "cucumber-js": (args, env) => {
    expect(args).toEqual([]);
    expect(env?.NODE_OPTIONS).toBe("--import tsx");
  },
};

/** Runners that answer with `replies`, by runner name, after checking the request is the one that runner answers. */
function runnersAnswering(replies: Record<string, CommandResult>) {
  return async (command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<CommandResult> => {
    expect(options.cwd).toBe("/work");
    const name = basename(command);
    const reply = replies[name];
    if (reply === undefined || REQUESTS[name] === undefined) throw new Error(`Unexpected command ${command}`);
    REQUESTS[name](args, options.env);
    return reply;
  };
}

describe("runGate", () => {
  test("runs types, the unit suite and the scenarios over the project, each passing or failing", async () => {
    const run = runnersAnswering({
      tsc: { exitCode: 2, output: TYPE_ERROR },
      vitest: { exitCode: 0, output: "Tests  1 passed (1)" },
      "cucumber-js": { exitCode: 0, output: "1 scenario (1 passed)" },
    });

    const checks = await runGate("/work", run);

    expect(checks.map(({ name, passed }) => ({ name, passed }))).toEqual([
      { name: "types", passed: false },
      { name: "unit", passed: true },
      { name: "scenarios", passed: true },
    ]);
  });
});

describe("gateRefusal", () => {
  test("names each failed check and gives its output as the evidence", () => {
    const refusal = gateRefusal([
      { name: "types", passed: false, output: TYPE_ERROR },
      { name: "unit", passed: true, output: "" },
    ]);

    expect(refusal?.failed).toContain("types");
    expect(refusal?.failed).not.toContain("unit");
    expect(refusal?.evidence).toContain(TYPE_ERROR);
  });

  test("refuses nothing when every check passes", () => {
    expect(gateRefusal([{ name: "types", passed: true, output: "" }])).toBeUndefined();
  });
});

describe("runGate, a check that ran nothing", () => {
  test("fails the unit and scenario checks that ran no test, even when the runner exits 0", async () => {
    // As vitest 3.2.7 and cucumber-js 13.3.0 answered on a project with no test and no scenario.
    const run = runnersAnswering({
      tsc: { exitCode: 0, output: "" },
      vitest: { exitCode: 1, output: "\n RUN  v3.2.7 /work\n\nNo test files found, exiting with code 1\n" },
      "cucumber-js": { exitCode: 0, output: "\n\n0 scenarios\n0 steps\n0m 0.000s (0m 0.000s executing your code)\n" },
    });

    const checks = await runGate("/work", run);

    expect(checks.map(({ name, passed, ranNothing }) => ({ name, passed, ranNothing: ranNothing ?? false }))).toEqual([
      { name: "types", passed: true, ranNothing: false },
      { name: "unit", passed: false, ranNothing: true },
      { name: "scenarios", passed: false, ranNothing: true },
    ]);
  });

  test("fails a type check that found no file to check", async () => {
    const run = runnersAnswering({
      tsc: { exitCode: 2, output: "error TS18003: No inputs were found in config file '/work/tsconfig.json'." },
      vitest: { exitCode: 0, output: "Tests  1 passed (1)" },
      "cucumber-js": { exitCode: 0, output: "1 scenario (1 passed)" },
    });

    expect((await runGate("/work", run))[0]).toMatchObject({ name: "types", passed: false, ranNothing: true });
  });
});

describe("gateError", () => {
  test("a runner that does not know an option is an error that names the check and the option", async () => {
    const run = runnersAnswering({
      tsc: { exitCode: 2, output: "tsconfig.json(13,5): error TS5023: Unknown compiler option 'noSuchCompilerOption'.\n" },
      vitest: { exitCode: 0, output: "Tests  1 passed (1)" },
      "cucumber-js": { exitCode: 0, output: "1 scenario (1 passed)" },
    });

    const error = gateError(await runGate("/work", run));

    expect(error).toContain("types");
    expect(error).toContain("noSuchCompilerOption");
  });

  test("no error when every runner knew its options", () => {
    expect(gateError([{ name: "types", passed: false, output: TYPE_ERROR }])).toBeUndefined();
  });
});
