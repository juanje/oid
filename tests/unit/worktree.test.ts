import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createRunWorktree } from "../../src/worktree.ts";
import { git, tempRepo } from "./support/repo.ts";

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
