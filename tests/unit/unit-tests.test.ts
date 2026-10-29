import { describe, expect, test } from "vitest";
import type { CommandResult } from "../../src/command.ts";
import { runUnitTests } from "../../src/unit-tests.ts";
import { recorded, recordedVitest } from "./support/recorded.ts";
import { tempRepo } from "./support/repo.ts";

describe("runUnitTests", () => {
  test("runs the given test files and returns which tests passed and which failed", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = recordedVitest(dir, ["tests/greet-all.test.ts"], recorded("vitest-greet-02-assert.json"));

    expect(await runUnitTests(dir, ["tests/greet-all.test.ts"], run)).toMatchObject({
      ran: true,
      passed: ["tests/greet.test.ts > greets a person by name"],
      failed: ["tests/greet-all.test.ts > greets two people together"],
    });
  });

  test("says when vitest was stopped at the time limit", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const stopped = async (): Promise<CommandResult> => ({ exitCode: 1, output: "did not finish within 5 s", stoppedAfter: 5 });

    expect(await runUnitTests(dir, [], stopped)).toMatchObject({ ran: false, stoppedAfter: 5 });
  });

  test("runs the whole suite when given no files", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    const run = recordedVitest(dir, [], recorded("vitest-greet-02-load.json"));

    expect(await runUnitTests(dir, [], run)).toMatchObject({ ran: true });
  });

  test("measures the coverage of every source path the project names", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    let asked: string[] = [];
    const run = async (_command: string, args: string[]) => {
      asked = args;
      return { exitCode: 1, output: "" };
    };

    await runUnitTests(dir, [], run, { dir: "/tmp/coverage", source: ["src/", "shared/"] });

    expect(asked.filter((arg) => arg.startsWith("--coverage.include="))).toEqual(["--coverage.include=src/**", "--coverage.include=shared/**"]);
  });

  test("never reads a report left by an earlier run when vitest writes none", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    await runUnitTests(dir, [], recordedVitest(dir, [], recorded("vitest-greet-02-assert.json")));

    expect(await runUnitTests(dir, [], recordedVitest(dir, [], undefined))).toMatchObject({ ran: false, passed: [], failed: [] });
  });
});
