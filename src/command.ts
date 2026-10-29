import { spawn } from "node:child_process";
import { join } from "node:path";

export interface CommandResult {
  exitCode: number;
  /** stdout and stderr, interleaved as they arrived. */
  output: string;
  /** The time limit, in seconds, the command was stopped at before it finished (FR-RUN-09). */
  stoppedAfter?: number;
}

export interface CommandOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Seconds after which the command, and every process it started, is stopped (FR-RUN-09). */
  timeLimit?: number;
}

export type CommandRunner = typeof runCommand;

/** A runner installed in the project, such as `vitest` or `cucumber-js`. */
export function projectBin(dir: string, name: string): string {
  return join(dir, "node_modules/.bin", name);
}

/** cucumber-js loads TypeScript step definitions only through tsx. */
export const TYPESCRIPT_STEPS_ENV = { NODE_OPTIONS: "--import tsx" };

// A process stopped at the limit gets this long to end on SIGTERM before SIGKILL.
const GRACE_MS = 2000;

/** What a check stopped at its time limit says, wherever it ran (FR-RUN-09). */
export function didNotFinish(seconds: number): string {
  return `did not finish within ${seconds} s`;
}

/**
 * Runs a command to its end, or to its time limit. It uses spawn, not spawnSync, so the event loop keeps running while
 * the child does. The child leads its own process group, so that stopping it stops the workers it started too: a
 * runner's workers left behind would keep running the code that never returns.
 */
export function runCommand(command: string, args: string[], options: CommandOptions): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, detached: true });
    let output = "";
    let stopped = false;
    const signalGroup = (signal: NodeJS.Signals): void => {
      try {
        process.kill(-child.pid!, signal);
      } catch {
        // The group has already ended.
      }
    };
    const timers: NodeJS.Timeout[] = [];
    if (options.timeLimit !== undefined) {
      timers.push(
        setTimeout(() => {
          stopped = true;
          signalGroup("SIGTERM");
          timers.push(setTimeout(() => signalGroup("SIGKILL"), GRACE_MS));
        }, options.timeLimit * 1000),
      );
    }
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      for (const timer of timers) clearTimeout(timer);
      // What a stopped command started may still hold on: it goes with it.
      if (stopped) signalGroup("SIGKILL");
      // A child killed by a signal has no exit code; it did not succeed.
      if (!stopped) return resolve({ exitCode: code ?? 1, output });
      resolve({ exitCode: 1, output: `${output}\n${didNotFinish(options.timeLimit!)}\n`, stoppedAfter: options.timeLimit! });
    });
  });
}

/** A runner that stops every command at `seconds`, and tells `onStopped` of each one it stopped (FR-RUN-09). */
export function checkRunner(seconds: number, onStopped: () => Promise<void>): CommandRunner {
  return async (command, args, options) => {
    const result = await runCommand(command, args, { ...options, timeLimit: seconds });
    if (result.stoppedAfter !== undefined) await onStopped();
    return result;
  };
}
