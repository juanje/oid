import { basename } from "node:path";
import { describe, expect, test } from "vitest";
import type { CommandResult } from "../../src/command.ts";
import { gateRefusal, runGate } from "../../src/gate.ts";

const TYPE_ERROR = "src/a.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.";

/** Replies as each runner would, after checking the request is the one that runner answers. */
async function recordedRunner(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<CommandResult> {
  expect(options.cwd).toBe("/work");
  switch (basename(command)) {
    case "tsc":
      expect(args).toEqual(["--noEmit"]);
      return { exitCode: 2, output: TYPE_ERROR };
    case "vitest":
      expect(args).toEqual(["run"]);
      return { exitCode: 0, output: "Tests  1 passed (1)" };
    case "cucumber-js":
      expect(options.env?.NODE_OPTIONS).toBe("--import tsx");
      return { exitCode: 0, output: "1 scenario (1 passed)" };
    default:
      throw new Error(`Unexpected command ${command}`);
  }
}

describe("runGate", () => {
  test("runs types, the unit suite and the scenarios over the project, each passing or failing", async () => {
    const checks = await runGate("/work", recordedRunner);

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
