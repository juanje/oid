import { spawn } from "node:child_process";

export interface CommandResult {
  exitCode: number;
  /** stdout and stderr, interleaved as they arrived. */
  output: string;
}

export interface CommandOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export type CommandRunner = typeof runCommand;

/** Runs a command to its end. It uses spawn, not spawnSync, so the event loop keeps running while the child does. */
export function runCommand(command: string, args: string[], options: CommandOptions): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      // A child killed by a signal has no exit code; it did not succeed.
      resolve({ exitCode: code ?? 1, output });
    });
  });
}
