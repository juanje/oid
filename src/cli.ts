import type { Executor } from "./executor.ts";
import { runFr } from "./run.ts";

export interface CliIo {
  cwd: string;
  executor: Executor;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** The `oid` command line, in-process: `run <FR>`. Returns the exit code. */
export async function runCli(args: string[], io: CliIo): Promise<number> {
  const fr = args[1];
  return runFr({ projectDir: io.cwd, fr, executor: io.executor, out: io.stdout });
}
