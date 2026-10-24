import { helpText, parseArgs, usageOf } from "./cli-args.ts";
import type { Executor } from "./executor.ts";
import { EXIT_ERROR, EXIT_OK } from "./exit.ts";
import { oidVersion } from "./version.ts";

export interface CliIo {
  cwd: string;
  /** The executor, or how to make it once the command is known to be valid: the real one reads the project's config. */
  executor: Executor | (() => Promise<Executor>);
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** The `oid` command line, in-process: its commands, the help and the version (FR-CLI-04). Returns the exit code. */
export async function runCli(args: string[], io: CliIo): Promise<number> {
  const parsed = parseArgs(args);
  if ("error" in parsed) {
    io.stderr(`${parsed.error}\n\n${helpText()}\n`);
    return EXIT_ERROR;
  }
  if (parsed.command === "help") {
    io.stdout(`${parsed.of === undefined ? helpText() : usageOf(parsed.of)}\n`);
    return EXIT_OK;
  }
  if (parsed.command === "version") {
    io.stdout(`${oidVersion()}\n`);
    return EXIT_OK;
  }
  // The run's modules load only for a run, never for the help or the version (NFR-07).
  const { runFr } = await import("./run.ts");
  return runFr({ projectDir: io.cwd, fr: parsed.fr, executor: io.executor, out: io.stdout });
}
