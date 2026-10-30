import { readdir, realpath, writeFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import type { CommandResult } from "../../src/command.ts";
import { runUnitTests } from "../../src/unit-tests.ts";
import { recorded, recordedVitest } from "./support/recorded.ts";
import { git, tempRepo } from "./support/repo.ts";

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

  test("two runs at once each read their own report, and leave none behind", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    // vitest reports real paths.
    const root = await realpath(dir);
    const passing = (name: string) => JSON.stringify({ testResults: [{ name: `${root}/tests/${name}.test.ts`, status: "passed", message: "", assertionResults: [{ fullName: name, status: "passed" }] }] });
    const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
    // Each vitest writes its report `after` ms into the run, and ends at 60 ms: the second writes while the first runs.
    const vitest = (name: string, after: number) => async (_command: string, args: string[]): Promise<CommandResult> => {
      const report = args.find((arg) => arg.startsWith("--outputFile="))!.slice("--outputFile=".length);
      await wait(after);
      await writeFile(report, passing(name));
      await wait(60 - after);
      return { exitCode: 0, output: "" };
    };
    const reports = () => readdir(git(dir, "rev-parse", "--absolute-git-dir"), { recursive: true }).then((names) => names.filter((name) => name.endsWith("oid-unit-tests.json")));

    const [first, second] = await Promise.all([runUnitTests(dir, [], vitest("first", 10)), runUnitTests(dir, [], vitest("second", 30))]);

    expect([first.passed, second.passed]).toEqual([["tests/first.test.ts > first"], ["tests/second.test.ts > second"]]);
    expect(await reports()).toEqual([]);
  });

  test("never reads a report left by an earlier run when vitest writes none", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });
    await runUnitTests(dir, [], recordedVitest(dir, [], recorded("vitest-greet-02-assert.json")));

    expect(await runUnitTests(dir, [], recordedVitest(dir, [], undefined))).toMatchObject({ ran: false, passed: [], failed: [] });
  });
});
