import { runCli } from "./cli.ts";

/** `oid <args>` as the person types it, in the current directory, with Pi on the model the project's .oid.json names. */
export function main(args: string[]): Promise<number> {
  const cwd = process.cwd();
  return runCli(args, {
    cwd,
    // Pi loads only when a command needs an executor, never for the help or the version (NFR-07).
    executor: async () => {
      const [{ executorFromConfig }, { personalConfigDir }] = await Promise.all([import("./pi-model.ts"), import("./config.ts")]);
      return executorFromConfig(cwd, { configDir: personalConfigDir(process.env) });
    },
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}
