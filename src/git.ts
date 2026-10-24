import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Runs git in `dir` and returns its trimmed stdout; a failing command rejects. */
export async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: dir });
  return stdout.trim();
}

/** A path for a runner's report in the worktree's own git directory, out of the project's files. */
export async function reportPath(worktreeDir: string, name: string): Promise<string> {
  return join(await git(worktreeDir, "rev-parse", "--absolute-git-dir"), name);
}
