import { existsSync } from "node:fs";
import { chmod, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { startRunLog } from "../../src/run-log.ts";
import { acceptedWork, checkpoint, commitFr, createRunWorktree, finishRun, freeRunId, scratchCopy, takeAttemptChanges, takeAttemptDiff } from "../../src/worktree.ts";
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

describe("acceptedWork", () => {
  test("goes back to the work accepted before an attempt: its new files gone, its changes undone, earlier work kept", async () => {
    const repo = await tempRepo({ "src/greet.ts": "first\n" });
    await writeFiles(repo, { "node_modules/dep/index.js": "export {};\n" });
    const worktree = await createRunWorktree(repo, "r1");
    await writeFiles(worktree.dir, { "tests/greet.test.ts": "accepted earlier\n" });
    await takeAttemptDiff(worktree.dir);
    const accepted = await acceptedWork(worktree.dir);
    await writeFiles(worktree.dir, { "src/greet.ts": "refused\n", "src/leftover.ts": "refused\n" });
    await takeAttemptDiff(worktree.dir);

    await accepted.restore();

    expect({
      greet: await readFile(join(worktree.dir, "src/greet.ts"), "utf8"),
      leftover: existsSync(join(worktree.dir, "src/leftover.ts")),
      earlier: existsSync(join(worktree.dir, "tests/greet.test.ts")),
      nodeModules: existsSync(join(worktree.dir, "node_modules/dep/index.js")),
    }).toEqual({ greet: "first\n", leftover: false, earlier: true, nodeModules: true });
  });
});

describe("two runs of one id", () => {
  test("each get a branch, a worktree and checkpoints of their own", async () => {
    const repo = await tempRepo({ "a.txt": "a\n" });

    const first = await createRunWorktree(repo, await freeRunId(repo, "FR-X-01-20261024T120000"));
    const second = await createRunWorktree(repo, await freeRunId(repo, "FR-X-01-20261024T120000"));

    expect(new Set([first.branch, second.branch]).size).toBe(2);
    expect(new Set([first.dir, second.dir]).size).toBe(2);
    expect(new Set([first.checkpoints, second.checkpoints]).size).toBe(2);
  });
});

describe("one run", () => {
  test("names its log, its worktree, its branch and its checkpoints with the one id it chose", async () => {
    const repo = await tempRepo({ "a.txt": "a\n" });
    const id = await freeRunId(repo, "FR-X-01-20261024T120000");

    // The run starts its log, and records its first stage, before its worktree (FR-CLI-05).
    const log = await startRunLog(repo, id);
    await log.record({ event: "stage", stage: "agent" });
    const worktree = await createRunWorktree(repo, id);

    expect(basename(log.path)).toBe(`${id}.jsonl`);
    expect({ id: worktree.id, branch: worktree.branch, checkpoints: worktree.checkpoints }).toEqual({ id, branch: `oid/${id}`, checkpoints: `refs/oid/checkpoints/${id}` });
  });
});

describe("checkpoint", () => {
  test("commits an accepted attempt on top of the last checkpoint and points the run's checkpoint ref at it", async () => {
    const repo = await tempRepo({ "a.txt": "first\n" });
    const start = git(repo, "rev-parse", "HEAD");
    const worktree = await createRunWorktree(repo, "r1");
    await writeFiles(worktree.dir, { "features/steps/a.steps.ts": "export {};\n" });
    await takeAttemptDiff(worktree.dir);

    await checkpoint(worktree, "steps for a scenario");

    expect(git(repo, "rev-parse", `${worktree.checkpoints}^`)).toBe(start);
    expect(git(repo, "ls-tree", "-r", "--name-only", worktree.checkpoints)).toContain("features/steps/a.steps.ts");
    expect(git(repo, "rev-parse", worktree.branch)).toBe(start);
  });

  test("runs none of the project's hooks, for the worktree or its commits", async () => {
    const repo = await tempRepo({ "a.txt": "first\n" });
    const mark = `${repo}.hook-ran`;
    for (const hook of ["pre-commit", "commit-msg", "post-commit", "post-checkout"]) {
      await writeFiles(repo, { [`.git/hooks/${hook}`]: `#!/bin/sh\necho ${hook} >> "${mark}"\nexit 1\n` });
      await chmod(join(repo, ".git/hooks", hook), 0o755);
    }
    const worktree = await createRunWorktree(repo, "r1");
    await writeFiles(worktree.dir, { "src/a.ts": "export {};\n" });
    await takeAttemptDiff(worktree.dir);

    await checkpoint(worktree, "code for a scenario");
    await commitFr(worktree, worktree.start, "feat(FR-X-01): built");
    await finishRun(worktree, true);

    expect(existsSync(mark)).toBe(false);
  });
});

describe("finishRun", () => {
  test("a built run: each FR's checkpoints squashed onto the branch as one commit, in order, its checkpoint ref deleted, its worktree removed", async () => {
    const repo = await tempRepo({ "a.txt": "first\n" });
    await writeFiles(repo, { "node_modules/dep/index.js": "export {};\n" });
    const start = git(repo, "rev-parse", "HEAD");
    const worktree = await createRunWorktree(repo, "r1");
    const build = async (attempts: Record<string, string>[]) => {
      for (const files of attempts) {
        await writeFiles(worktree.dir, files);
        await takeAttemptDiff(worktree.dir);
        await checkpoint(worktree, "an accepted attempt");
      }
    };
    await build([{ "features/steps/a.steps.ts": "export {};\n" }, { "a.txt": "changed\n", "src/new.ts": "export {};\n" }]);
    await commitFr(worktree, start, "feat(FR-X-01): built");
    const first = git(repo, "rev-parse", worktree.branch);
    await build([{ "src/other.ts": "export {};\n" }]);
    await commitFr(worktree, first, "feat(FR-X-02): built");

    await finishRun(worktree, true);

    expect(git(repo, "log", "--reverse", "--format=%s", `${start}..${worktree.branch}`).split("\n")).toEqual(["feat(FR-X-01): built", "feat(FR-X-02): built"]);
    expect(git(repo, "diff", "--name-only", start, `${worktree.branch}^`).split("\n")).toEqual(["a.txt", "features/steps/a.steps.ts", "src/new.ts"]);
    expect(git(repo, "for-each-ref", worktree.checkpoints)).toBe("");
    expect(existsSync(worktree.dir)).toBe(false);
  });

  test("a run that stops before the end: its worktree removed, its branch at the start, its checkpoints kept", async () => {
    const repo = await tempRepo({ "a.txt": "first\n" });
    const start = git(repo, "rev-parse", "HEAD");
    const worktree = await createRunWorktree(repo, "r1");
    await writeFiles(worktree.dir, { "features/steps/a.steps.ts": "export {};\n" });
    await takeAttemptDiff(worktree.dir);
    await checkpoint(worktree, "steps for a scenario");

    await finishRun(worktree, false);

    expect(git(repo, "rev-parse", worktree.branch)).toBe(start);
    expect(git(repo, "ls-tree", "-r", "--name-only", worktree.checkpoints)).toContain("features/steps/a.steps.ts");
    expect(existsSync(worktree.dir)).toBe(false);
  });
});

describe("scratchCopy", () => {
  test("is the run's code at an earlier checkpoint, beside its worktree, with files put from the last checkpoint or from the attempt", async () => {
    const repo = await tempRepo({ "src/greet.ts": "before\n", "tests/a.test.ts": "old\n" });
    await writeFiles(repo, { "node_modules/dep/index.js": "export {};\n" });
    const worktree = await createRunWorktree(repo, "r1");
    const before = git(worktree.dir, "rev-parse", "HEAD");
    await writeFiles(worktree.dir, { "src/greet.ts": "after\n" });
    await takeAttemptDiff(worktree.dir);
    await checkpoint(worktree, "code");
    await writeFiles(worktree.dir, { "tests/a.test.ts": "new\n", "tests/b.test.ts": "added\n" });
    const files = ["tests/a.test.ts", "tests/b.test.ts"];
    const read = async (dir: string) => ({
      greet: await readFile(join(dir, "src/greet.ts"), "utf8"),
      a: await readFile(join(dir, "tests/a.test.ts"), "utf8"),
      b: existsSync(join(dir, "tests/b.test.ts")),
    });

    const scratch = await scratchCopy(worktree, before);
    await scratch.put(files, "checkpoint");
    const fromCheckpoint = await read(scratch.dir);
    await scratch.put(files, "attempt");
    const fromAttempt = await read(scratch.dir);
    const shares = existsSync(join(scratch.dir, "node_modules/dep/index.js"));
    await scratch.remove();

    expect({ fromCheckpoint, fromAttempt, shares, beside: dirname(scratch.dir) === dirname(worktree.dir), removed: existsSync(scratch.dir) }).toEqual({
      fromCheckpoint: { greet: "before\n", a: "old\n", b: false },
      fromAttempt: { greet: "before\n", a: "new\n", b: true },
      shares: true,
      beside: true,
      removed: false,
    });
  });
});
