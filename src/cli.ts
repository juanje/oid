import { parseArgs } from "./cli-args.ts";
import { ConfigError } from "./config.ts";
import type { Executor } from "./executor.ts";
import { EXIT_ERROR } from "./exit.ts";
import { runFr } from "./run.ts";

export interface CliIo {
  cwd: string;
  /** The executor, or how to make it once the command is known to be valid: the real one reads the project's config. */
  executor: Executor | (() => Promise<Executor>);
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** The `oid` command line, in-process: `run <FR>`. Returns the exit code. */
export async function runCli(args: string[], io: CliIo): Promise<number> {
  const parsed = parseArgs(args);
  if ("error" in parsed) {
    io.stderr(`${parsed.error}\n`);
    return EXIT_ERROR;
  }
  let executor: Executor;
  try {
    executor = typeof io.executor === "function" ? await io.executor() : io.executor;
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    io.stderr(`${error.message}\n`);
    return EXIT_ERROR;
  }
  return runFr({ projectDir: io.cwd, fr: parsed.fr, executor, out: io.stdout });
}
