import { join, resolve } from "node:path";
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
  return { dir, branch };
}
