import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { git } from "./git.ts";

export interface RunWorktree {
  dir: string;
  branch: string;
}

/** Checks out a new branch from HEAD in a worktree inside the repository's git directory, where the person's working copy never sees it. */
export async function createRunWorktree(projectDir: string, runId: string): Promise<RunWorktree> {
  const gitDir = resolve(projectDir, await git(projectDir, "rev-parse", "--git-common-dir"));
  const dir = join(gitDir, "oid", "worktrees", runId);
  const branch = `oid/${runId}`;
  await git(projectDir, "worktree", "add", "-q", "-b", branch, dir, "HEAD");
  await shareNodeModules(projectDir, dir);
  return { dir, branch };
}

/** Worktrees do not share node_modules, so the worktree gets a link to the project's, hidden from git. */
async function shareNodeModules(projectDir: string, worktreeDir: string): Promise<void> {
  await symlink(join(projectDir, "node_modules"), join(worktreeDir, "node_modules"));
  // A symlink is a file to git, so `node_modules/` in the project's .gitignore does not hide it; the shared exclude file does.
  const exclude = resolve(worktreeDir, await git(worktreeDir, "rev-parse", "--git-path", "info/exclude"));
  const current = existsSync(exclude) ? await readFile(exclude, "utf8") : "";
  if (!current.split("\n").includes(NODE_MODULES_PATTERN)) {
    await mkdir(dirname(exclude), { recursive: true });
    await appendFile(exclude, `${current === "" || current.endsWith("\n") ? "" : "\n"}${NODE_MODULES_PATTERN}\n`);
  }
}

const NODE_MODULES_PATTERN = "/node_modules";

/** The files the last attempt changed, sorted. The index holds what earlier attempts changed, so this stages the new changes too. */
export async function takeAttemptChanges(worktreeDir: string): Promise<string[]> {
  const modified = await git(worktreeDir, "diff", "--name-only");
  const added = await git(worktreeDir, "ls-files", "--others", "--exclude-standard");
  await git(worktreeDir, "add", "--all");
  const files = [...modified.split("\n"), ...added.split("\n")].filter((file) => file !== "");
  return [...new Set(files)].sort();
}

/** Commits every change in the worktree as one commit on the run's branch. */
export async function commitRun(worktreeDir: string, message: string): Promise<void> {
  await git(worktreeDir, "add", "--all");
  await git(worktreeDir, "commit", "-q", "-m", message);
}
