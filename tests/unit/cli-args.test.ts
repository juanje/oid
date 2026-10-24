import { describe, expect, test } from "vitest";
import { COMMANDS, helpText, parseArgs, usageOf } from "../../src/cli-args.ts";

describe("parseArgs", () => {
  test("reads oid run <FR>", () => {
    expect(parseArgs(["run", "FR-GREET-01"])).toEqual({ command: "run", fr: "FR-GREET-01" });
  });

  test("an option it does not know is an error that names it", () => {
    expect(parseArgs(["run", "FR-GREET-01", "--no-such-option"])).toEqual({ error: expect.stringContaining("--no-such-option") });
  });

  test("a command it does not know, or a run without its FR, is an error", () => {
    expect(parseArgs(["fly"])).toEqual({ error: expect.stringContaining("fly") });
    expect(parseArgs(["run"])).toEqual({ error: expect.stringContaining("FR") });
  });
  test("asks for the help with no arguments, --help or help, and for a command's usage with that command's --help", () => {
    for (const args of [[], ["--help"], ["help"]]) expect(parseArgs(args)).toEqual({ command: "help" });
    expect(parseArgs(["run", "--help"])).toEqual({ command: "help", of: "run" });
  });

  test("asks for the version with --version", () => {
    expect(parseArgs(["--version"])).toEqual({ command: "version" });
  });
});

describe("the help", () => {
  test("lists every command of the table the parser reads, with its usage and what it does", () => {
    const help = helpText();

    for (const command of COMMANDS) {
      expect(help).toContain(command.usage);
      expect(help).toContain(command.does);
    }
    expect(help).toContain("--version");
  });

  test("gives a command's usage from the same table", () => {
    const run = COMMANDS.find((command) => command.name === "run")!;

    expect(usageOf("run")).toContain(run.usage);
    expect(parseArgs(["run"])).toEqual({ error: expect.stringContaining(run.usage) });
  });
});
