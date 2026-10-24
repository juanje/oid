import { symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { git } from "./git.ts";

// The worktree's link to the project's node_modules is a file to git, and the project's `node_modules/` pattern
// does not ignore it. The run's own git commands leave it out, so neither info/exclude nor .gitignore is touched.
const NOT_NODE_MODULES = [".", ":(exclude)node_modules"];

export interface RunWorktree {
  dir: string;
  branch: string;
}

/**
 * Checks out a new branch from HEAD in a worktree beside the repository, in ../.oid-worktrees/<repository>/<run id>:
 * the person's checkout never holds it, and tools that skip paths containing .git still see it.
 */
export async function createRunWorktree(projectDir: string, runId: string): Promise<RunWorktree> {
  const root = await git(projectDir, "rev-parse", "--show-toplevel");
  const dir = join(dirname(root), ".oid-worktrees", basename(root), runId);
  const branch = `oid/${runId}`;
  await git(projectDir, "worktree", "add", "-q", "-b", branch, dir, "HEAD");
  // Worktrees do not share node_modules.
  await symlink(join(projectDir, "node_modules"), join(dir, "node_modules"));
  return { dir, branch };
}

/** The files the last attempt changed, sorted. The index holds what earlier attempts changed, so this stages the new changes too. */
export async function takeAttemptChanges(worktreeDir: string): Promise<string[]> {
  const modified = await git(worktreeDir, "diff", "--name-only", "-z", "--", ...NOT_NODE_MODULES);
  const added = await git(worktreeDir, "ls-files", "--others", "--exclude-standard", "-z", "--", ...NOT_NODE_MODULES);
  const files = [...new Set([...modified.split("\0"), ...added.split("\0")].filter((file) => file !== ""))].sort();
  // Staging only these files keeps the link out, which `git add --all` with an exclude pathspec cannot do
  // without failing when the project's .gitignore already ignores node_modules.
  if (files.length > 0) await git(worktreeDir, "add", "--all", "--", ...files);
  return files;
}

/** Commits every change in the worktree as one commit on the run's branch. */
export async function commitRun(worktreeDir: string, message: string): Promise<void> {
  await takeAttemptChanges(worktreeDir);
  await git(worktreeDir, "commit", "-q", "-m", message);
}
