import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { helpText, usageOf } from "../../src/cli-args.ts";
import { runCli } from "../../src/cli.ts";
import type { Executor } from "../../src/executor.ts";

const VERSION = (JSON.parse(readFileSync(join(import.meta.dirname, "../../package.json"), "utf8")) as { version: string }).version;

/** oid's command line with its two streams kept apart, and an executor that must never be asked for. */
async function cli(args: string[]) {
  const streams = { stdout: "", stderr: "" };
  const executor = async (): Promise<Executor> => {
    throw new Error("The command asked for an executor");
  };
  const code = await runCli(args, {
    cwd: "/nowhere",
    executor,
    stdout: (text) => (streams.stdout += text),
    stderr: (text) => (streams.stderr += text),
  });
  return { code, ...streams };
}

describe("runCli", () => {
  test("prints the help on stdout and exits 0, with no arguments, --help or help", async () => {
    for (const args of [[], ["--help"], ["help"]]) {
      expect(await cli(args)).toEqual({ code: 0, stdout: `${helpText()}\n`, stderr: "" });
    }
  });

  test("prints a command's usage on stdout for its --help, or for help with its name", async () => {
    expect(await cli(["run", "--help"])).toEqual({ code: 0, stdout: `${usageOf("run")}\n`, stderr: "" });
    expect(await cli(["help", "run"])).toEqual({ code: 0, stdout: `${usageOf("run")}\n`, stderr: "" });
  });

  test("prints the version of oid's package on stdout", async () => {
    expect(await cli(["--version"])).toEqual({ code: 0, stdout: `${VERSION}\n`, stderr: "" });
  });

  test("prints an unknown command's error with the help on stderr, and exits 2", async () => {
    const { code, stdout, stderr } = await cli(["shorten"]);

    expect({ code, stdout }).toEqual({ code: 2, stdout: "" });
    expect(stderr).toContain("shorten");
    expect(stderr).toContain(helpText());
  });
});
