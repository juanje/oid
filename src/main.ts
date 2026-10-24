import { runCli } from "./cli.ts";
import { executorFromConfig } from "./pi-model.ts";

/** `oid <args>` as the person types it, in the current directory, with Pi on the model the project's .oid.json names. */
export function main(args: string[]): Promise<number> {
  const cwd = process.cwd();
  return runCli(args, {
    cwd,
    executor: () => executorFromConfig(cwd),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}
