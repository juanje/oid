import { parseArgs } from "./cli-args.ts";
import type { Executor } from "./executor.ts";
import { EXIT_ERROR } from "./exit.ts";
import { runFr } from "./run.ts";

export interface CliIo {
  cwd: string;
  executor: Executor;
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
  return runFr({ projectDir: io.cwd, fr: parsed.fr, executor: io.executor, out: io.stdout });
}
