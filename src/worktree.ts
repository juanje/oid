import { readFile, symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { AddedLine } from "./boundaries.ts";
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

export interface AttemptDiff {
  /** The files the attempt changed, sorted. */
  files: string[];
  /** The lines it added: the new lines of a changed file, every line of a new one. */
  added: AddedLine[];
}

/** The last attempt's diff. The index holds what earlier attempts changed, so this stages the new changes too. */
export async function takeAttemptDiff(worktreeDir: string): Promise<AttemptDiff> {
  const { modified, created } = await changedSinceLastAttempt(worktreeDir);
  const added = linesAddedTo(await git(worktreeDir, "diff", "-U0", "--no-color", "--", ...NOT_NODE_MODULES));
  for (const file of created) {
    const content = await readFile(join(worktreeDir, file), "utf8");
    added.push(...content.split("\n").filter((text, index, lines) => index < lines.length - 1 || text !== "").map((text) => ({ file, text })));
  }
  const files = [...new Set([...modified, ...created])].sort();
  // Staging only these files keeps the link out, which `git add --all` with an exclude pathspec cannot do
  // without failing when the project's .gitignore already ignores node_modules.
  if (files.length > 0) await git(worktreeDir, "add", "--all", "--", ...files);
  return { files, added };
}

/**
 * The work accepted so far: the index, where every accepted attempt's diff is staged. `restore` brings the worktree
 * and the index back to it, so a retry starts as the refused attempt did (FR-RUN-07). The checkpoints of FR-STATE-01
 * take this place later.
 */
export async function acceptedWork(worktreeDir: string): Promise<{ restore: () => Promise<void> }> {
  const tree = await git(worktreeDir, "write-tree");
  return {
    restore: async () => {
      await git(worktreeDir, "read-tree", "-u", "--reset", tree);
    },
  };
}

/** The files the last attempt changed, sorted, staged as `takeAttemptDiff` stages them. */
export async function takeAttemptChanges(worktreeDir: string): Promise<string[]> {
  return (await takeAttemptDiff(worktreeDir)).files;
}

/** The files the attempt under way has changed so far, sorted, without staging them. */
export async function attemptFiles(worktreeDir: string): Promise<string[]> {
  const { modified, created } = await changedSinceLastAttempt(worktreeDir);
  return [...new Set([...modified, ...created])].sort();
}

/** The files changed, and the files created, since the index: the index holds what earlier attempts changed. */
async function changedSinceLastAttempt(worktreeDir: string): Promise<{ modified: string[]; created: string[] }> {
  const modified = nulSeparated(await git(worktreeDir, "diff", "--name-only", "-z", "--", ...NOT_NODE_MODULES));
  const created = nulSeparated(await git(worktreeDir, "ls-files", "--others", "--exclude-standard", "-z", "--", ...NOT_NODE_MODULES));
  return { modified, created };
}

function nulSeparated(text: string): string[] {
  return text.split("\0").filter((file) => file !== "");
}

/** The `+` lines of a unified diff, with the file each belongs to. */
function linesAddedTo(patch: string): AddedLine[] {
  const added: AddedLine[] = [];
  let file = "";
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ ")) file = line.replace(/^\+\+\+ b\//, "");
    else if (line.startsWith("+")) added.push({ file, text: line.slice(1) });
  }
  return added;
}

/** Commits every change in the worktree as one commit on the run's branch. */
export async function commitRun(worktreeDir: string, message: string): Promise<void> {
  await takeAttemptChanges(worktreeDir);
  await git(worktreeDir, "commit", "-q", "-m", message);
}
