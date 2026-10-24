import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { runCommand } from "../../src/command.ts";

describe("runCommand", () => {
  test("returns the exit code and the output of both streams", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "process.stdout.write('out '); process.stderr.write('err'); process.exit(3)"],
      { cwd: tmpdir() },
    );

    expect(result).toEqual({ exitCode: 3, output: "out err" });
  });
});
