import { existsSync } from "node:fs";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { commitRun, createRunWorktree, takeAttemptChanges, takeAttemptDiff } from "../../src/worktree.ts";
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
    // A project that does not ignore node_modules sees it in its status, and must go on seeing it.
    await writeFiles(repo, { "node_modules/dep/index.js": "export {};\n" });
    const before = { status: git(repo, "status", "--porcelain"), branch: git(repo, "branch", "--show-current") };

    await createRunWorktree(repo, "r1");

    expect({ status: git(repo, "status", "--porcelain"), branch: git(repo, "branch", "--show-current") }).toEqual(before);
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("uncommitted\n");
  });

  test("lives outside the repository, in ../.oid-worktrees/<repository>/<run id>", async () => {
    const repo = await tempRepo({ "a.txt": "committed\n" });

    const worktree = await createRunWorktree(repo, "r1");

    const real = await realpath(repo);
    expect(await realpath(worktree.dir)).toBe(join(dirname(real), ".oid-worktrees", basename(real), "r1"));
  });

  test("shares the project's node_modules", async () => {
    const repo = await tempRepo({ "a.txt": "committed\n" });
    await writeFiles(repo, { "node_modules/dep/index.js": "export {};\n" });

    const worktree = await createRunWorktree(repo, "r1");

    const shared = join(worktree.dir, "node_modules/dep/index.js");
    expect(existsSync(shared), "node_modules is not in the worktree").toBe(true);
    expect(await readFile(shared, "utf8")).toBe("export {};\n");
  });
});

describe("takeAttemptChanges", () => {
  test("returns only the files changed since the previous attempt, never the shared node_modules", async () => {
    const repo = await tempRepo({ "a.txt": "first\n" });
    await writeFiles(repo, { "node_modules/dep/index.js": "export {};\n" });
    const worktree = await createRunWorktree(repo, "r1");
    await writeFiles(worktree.dir, { "features/steps/a.steps.ts": "export {};\n", "a.txt": "changed\n" });
    const first = await takeAttemptChanges(worktree.dir);
    await writeFiles(worktree.dir, { "tests/a.test.ts": "export {};\n" });

    const second = await takeAttemptChanges(worktree.dir);

    expect({ first, second }).toEqual({ first: ["a.txt", "features/steps/a.steps.ts"], second: ["tests/a.test.ts"] });
  });
});

describe("takeAttemptDiff", () => {
  test("gives the lines the last attempt added: new lines of a changed file, every line of a new one", async () => {
    const repo = await tempRepo({ "src/greet.ts": "export function greet() {\n  return 1;\n}\n" });
    const worktree = await createRunWorktree(repo, "r1");
    await writeFiles(worktree.dir, {
      "src/greet.ts": "export function greet() {\n  if (process.env.VITEST) return 2;\n  return 1;\n}\n",
      "tests/greet.test.ts": "test.only('x', () => {});\n",
    });

    const diff = await takeAttemptDiff(worktree.dir);

    expect(diff).toEqual({
      files: ["src/greet.ts", "tests/greet.test.ts"],
      added: [
        { file: "src/greet.ts", text: "  if (process.env.VITEST) return 2;" },
        { file: "tests/greet.test.ts", text: "test.only('x', () => {});" },
      ],
    });
  });
});

describe("commitRun", () => {
  test("commits every change in the worktree but the shared node_modules, as one commit on top of the starting HEAD", async () => {
    const repo = await tempRepo({ "a.txt": "first\n" });
    await writeFiles(repo, { "node_modules/dep/index.js": "export {};\n" });
    const start = git(repo, "rev-parse", "HEAD");
    const worktree = await createRunWorktree(repo, "r1");
    await writeFiles(worktree.dir, { "a.txt": "changed\n", "src/new.ts": "export {};\n" });

    await commitRun(worktree.dir, "feat(FR-X-01): built");

    expect(git(repo, "rev-parse", `${worktree.branch}^`)).toBe(start);
    expect(git(repo, "diff", "--name-only", start, worktree.branch).split("\n")).toEqual(["a.txt", "src/new.ts"]);
  });
});
