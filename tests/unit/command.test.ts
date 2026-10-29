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

  test("stops a command that runs past its time limit, with the processes it started, and says it did not finish", async () => {
    // The child starts a grandchild that writes its pid, then both run far past the limit, as vitest and its workers
    // would; they end on their own later, so that a test that fails leaves no process behind.
    const script = `const { spawn } = require("node:child_process"); const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 8000)"], { stdio: "ignore" }); process.stdout.write("started " + child.pid + "\\n"); setTimeout(() => {}, 4000);`;
    const started = Date.now();

    const result = await runCommand(process.execPath, ["-e", script], { cwd: tmpdir(), timeLimit: 1 });

    const grandchild = Number(/started (\d+)/.exec(result.output)?.[1]);
    expect({ exitCode: result.exitCode, stoppedAfter: result.stoppedAfter, says: result.output.includes("did not finish within 1 s") }).toEqual({ exitCode: 1, stoppedAfter: 1, says: true });
    expect(Date.now() - started).toBeLessThan(10_000);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(() => process.kill(grandchild, 0)).toThrow();
  });

  test("leaves a command that ends within its time limit as it ended", async () => {
    const result = await runCommand(process.execPath, ["-e", "process.stdout.write('done')"], { cwd: tmpdir(), timeLimit: 5 });

    expect(result).toEqual({ exitCode: 0, output: "done" });
  });
});
