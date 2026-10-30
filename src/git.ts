import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Runs git in `dir` and returns its trimmed stdout; a failing command rejects. None of oid's git commands runs the
 * project's hooks: worktrees share them, and a pre-commit hook could refuse a checkpoint (DOMAIN.md, git).
 */
export async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: dir });
  return stdout.trim();
}

/** Whether `ref` names something in the repository of `dir`. */
export async function refExists(dir: string, ref: string): Promise<boolean> {
  return git(dir, "rev-parse", "--verify", "--quiet", ref).then(
    () => true,
    () => false,
  );
}

/**
 * Runs `use` with a directory of its own for a runner's reports, in the worktree's own git directory, out of the
 * project's files, and removes it once `use` is done: two runs at once never read each other's reports.
 */
export async function withReportDir<T>(worktreeDir: string, use: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(await git(worktreeDir, "rev-parse", "--absolute-git-dir"), "oid-reports-"));
  try {
    return await use(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
