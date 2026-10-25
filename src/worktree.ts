import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { basename, dirname, join, resolve } from "node:path";
import type { AddedLine } from "./boundaries.ts";
import { git, refExists } from "./git.ts";

// The worktree's link to the project's node_modules is a file to git, and the project's `node_modules/` pattern
// does not ignore it. The run's own git commands leave it out, so neither info/exclude nor .gitignore is touched.
const NOT_NODE_MODULES = [".", ":(exclude)node_modules"];

export interface RunWorktree {
  /** The run's id, with the suffix it got if another run had taken it. */
  id: string;
  dir: string;
  /** The run's branch: the FR's commit lands on it when the FR is built, and nothing else does (FR-RUN-01). */
  branch: string;
  /** The ref that follows the run's last checkpoint, kept for a later resume when the run stops before the end. */
  checkpoints: string;
  /** The commit the run started from. */
  start: string;
  projectDir: string;
}

/**
 * `runId`, or `runId-<n>` when another run took it: its branch, its checkpoints, its worktree or its log. The run
 * starts its log before its worktree, so a run that stopped before creating one still holds its id. It is the one
 * place a run's id is chosen: once its log exists, the run's own log would look like another run's.
 */
export async function freeRunId(projectDir: string, runId: string): Promise<string> {
  const root = await git(projectDir, "rev-parse", "--show-toplevel");
  const runs = join(dirname(root), ".oid-worktrees", basename(root));
  const logs = join(resolve(root, await git(root, "rev-parse", "--git-common-dir")), "oid", "runs");
  const taken = async (id: string) =>
    (await refExists(root, `refs/heads/oid/${id}`)) || (await refExists(root, `${CHECKPOINTS}${id}`)) || existsSync(join(runs, id)) || existsSync(join(logs, `${id}.jsonl`));
  let id = runId;
  for (let n = 2; await taken(id); n += 1) id = `${runId}-${n}`;
  return id;
}

/**
 * Starts run `id` on a new branch from HEAD, in a worktree beside the repository, in
 * ../.oid-worktrees/<repository>/<run id>: the person's checkout never holds it, and tools that skip paths containing
 * .git still see it. The worktree's HEAD is detached, so checkpoints never touch the branch. `id` is the one
 * freeRunId chose.
 */
export async function createRunWorktree(projectDir: string, id: string): Promise<RunWorktree> {
  const root = await git(projectDir, "rev-parse", "--show-toplevel");
  const start = await git(projectDir, "rev-parse", "HEAD");
  const runs = join(dirname(root), ".oid-worktrees", basename(root));
  const worktree = { id, dir: join(runs, id), branch: `oid/${id}`, checkpoints: `${CHECKPOINTS}${id}`, start, projectDir: root };
  await git(root, "branch", worktree.branch, start);
  await git(root, "worktree", "add", "-q", "--detach", worktree.dir, start);
  // Worktrees do not share node_modules.
  await symlink(join(projectDir, "node_modules"), join(worktree.dir, "node_modules"));
  return worktree;
}

const CHECKPOINTS = "refs/oid/checkpoints/";

/** Commits an accepted attempt, staged by takeAttemptDiff, as the run's next checkpoint (FR-STATE-01). */
export async function checkpoint(worktree: RunWorktree, message: string): Promise<void> {
  await git(worktree.dir, "commit", "-q", "--no-verify", "--allow-empty", "-m", message);
  await git(worktree.dir, "update-ref", worktree.checkpoints, "HEAD");
}

/** Commits an FR on the run's branch: the squash of its checkpoints since `since`, the commit before it (FR-RUN-05). */
export async function commitFr(worktree: RunWorktree, since: string, message: string): Promise<void> {
  await takeAttemptChanges(worktree.dir);
  await git(worktree.dir, "reset", "-q", "--soft", since);
  await git(worktree.dir, "commit", "-q", "--no-verify", "--allow-empty", "-m", message);
  await git(worktree.dir, "update-ref", `refs/heads/${worktree.branch}`, "HEAD");
  await git(worktree.dir, "update-ref", worktree.checkpoints, "HEAD");
}

/**
 * Ends a run. Its branch holds one commit per FR it built; a run that built every FR drops its checkpoints, and one
 * that stops keeps them for a later resume. Either way the worktree goes.
 */
export async function finishRun(worktree: RunWorktree, built: boolean): Promise<void> {
  if (built && (await refExists(worktree.dir, worktree.checkpoints))) await git(worktree.dir, "update-ref", "-d", worktree.checkpoints);
  await git(worktree.projectDir, "worktree", "remove", "--force", worktree.dir);
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

/** A copy of the run's code at an earlier checkpoint, where tests and step definitions are run against it (D-02). */
export interface Scratch {
  dir: string;
  /** Puts `files` as the run's last checkpoint has them, or as the attempt under way left them; one that is not there goes. */
  put(files: string[], from: "checkpoint" | "attempt"): Promise<void>;
  remove(): Promise<void>;
}

/**
 * A scratch copy of the run's worktree at `commit`, beside it, sharing the project's node_modules: the broken version
 * a test attempt or steps attempt asked for must fail on (FR-RUN-04).
 */
export async function scratchCopy(worktree: RunWorktree, commit: string): Promise<Scratch> {
  const dir = `${worktree.dir}-scratch`;
  await rm(dir, { recursive: true, force: true });
  await git(worktree.dir, "worktree", "add", "-q", "--detach", "--force", dir, commit);
  await symlink(join(worktree.projectDir, "node_modules"), join(dir, "node_modules"));
  return {
    dir,
    put: async (files, from) => {
      for (const file of files) {
        const content = from === "attempt" ? await readIfThere(join(worktree.dir, file)) : await gitShow(worktree.dir, `HEAD:${file}`);
        const target = join(dir, file);
        if (content === undefined) {
          await rm(target, { force: true });
          continue;
        }
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
      }
    },
    remove: async () => {
      await git(worktree.dir, "worktree", "remove", "--force", dir);
    },
  };
}

async function readIfThere(path: string): Promise<string | undefined> {
  return existsSync(path) ? readFile(path, "utf8") : undefined;
}

/** A file as a commit has it, untrimmed, or nothing when the commit does not have it. */
async function gitShow(dir: string, object: string): Promise<string | undefined> {
  try {
    return (await promisify(execFile)("git", ["show", object], { cwd: dir })).stdout;
  } catch {
    return undefined;
  }
}
