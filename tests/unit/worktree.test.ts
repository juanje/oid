import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { commitRun, createRunWorktree } from "../../src/worktree.ts";
import { git, tempRepo, writeFiles } from "./support/repo.ts";

describe("createRunWorktree", () => {
  test("checks out a new branch from HEAD, without the working copy's uncommitted changes", async () => {
    const repo = await tempRepo({ "a.txt": "committed\n" });
    await writeFile(join(repo, "a.txt"), "uncommitted\n");

    const worktree = await createRunWorktree(repo, "r1");

    expect(git(repo, "rev-parse", worktree.branch)).toBe(git(repo, "rev-parse", "HEAD"));
    expect(await readFile(join(worktree.dir, "a.txt"), "utf8")).toBe("committed\n");
  });

  test("leaves the working copy's files, branch and status as they were", async () => {
    const repo = await tempRepo({ "a.txt": "committed\n" });
    await writeFile(join(repo, "a.txt"), "uncommitted\n");
    const before = { status: git(repo, "status", "--porcelain"), branch: git(repo, "branch", "--show-current") };

    await createRunWorktree(repo, "r1");

    expect({ status: git(repo, "status", "--porcelain"), branch: git(repo, "branch", "--show-current") }).toEqual(before);
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("uncommitted\n");
  });
});

describe("commitRun", () => {
  test("commits every change in the worktree as one commit on top of the starting HEAD", async () => {
    const repo = await tempRepo({ "a.txt": "first\n" });
    const start = git(repo, "rev-parse", "HEAD");
    const worktree = await createRunWorktree(repo, "r1");
    await writeFiles(worktree.dir, { "a.txt": "changed\n", "src/new.ts": "export {};\n" });

    await commitRun(worktree.dir, "feat(FR-X-01): built");

    expect(git(repo, "rev-parse", `${worktree.branch}^`)).toBe(start);
    expect(git(repo, "diff", "--name-only", start, worktree.branch).split("\n")).toEqual(["a.txt", "src/new.ts"]);
  });
});
