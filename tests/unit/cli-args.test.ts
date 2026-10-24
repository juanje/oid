import { describe, expect, test } from "vitest";
import { parseArgs } from "../../src/cli-args.ts";

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
});
