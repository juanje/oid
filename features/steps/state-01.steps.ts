import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { GREET_01_SCENARIO, attemptDir, branches, filesUnder, git } from "../support/fixture.ts";
import { type OidRun, runBranch, runOid } from "../support/run.ts";
import { ScriptedExecutor, lastAttempt } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

const CHECKPOINTS = "refs/oid/checkpoints/";

/** Where the project's hook leaves a mark if it ever runs: outside the project, so no commit could hold it. */
function hookMark(world: RunWorld): string {
  return `${world.projectDir}.hook-ran`;
}

/** The project's checkpoint refs, one per run that kept its checkpoints. */
function checkpointRefs(world: RunWorld): string[] {
  return git(world.projectDir, "for-each-ref", "--format=%(refname)", CHECKPOINTS).split("\n").filter(Boolean);
}

Then("each attempt after the first started from a checkpoint holding every attempt accepted before it", async function (this: RunWorld) {
  const requests = this.executor?.requests ?? [];
  assert.equal(requests.length, this.script.length, "The executor was not asked for every prepared attempt");
  for (const [index, request] of requests.entries()) {
    // A checkpoint per accepted attempt, on top of the HEAD the run started from.
    const checkpoints = request.history.indexOf(this.startHead);
    assert.equal(checkpoints, index, `The ${request.kind} attempt started ${checkpoints} checkpoints after the start, not ${index}`);
    for (const earlier of this.script.slice(0, index)) {
      for (const file of await filesUnder(earlier.dir)) {
        assert.ok(request.committed.includes(file), `The checkpoint the ${request.kind} attempt started from does not hold ${file}`);
      }
    }
  }
});

Given("the project has a pre-commit hook that refuses every commit", async function (this: RunWorld) {
  const hook = join(this.projectDir, ".git/hooks/pre-commit");
  await writeFile(hook, `#!/bin/sh\necho ran > "${hookMark(this)}"\nexit 1\n`);
  await chmod(hook, 0o755);
});

Then("the project's hook never ran", function (this: RunWorld) {
  assert.ok(!existsSync(hookMark(this)), "The project's pre-commit hook ran");
});

When("I run {string} twice, one after the other, with the clock fixed", async function (this: RunWorld, command: string) {
  const [program, ...args] = command.split(" ");
  assert.equal(program, "oid");
  this.startHead = git(this.projectDir, "rev-parse", "HEAD");
  this.branchesBefore = branches(this.projectDir);
  const RealDate = Date;
  const fixed = new RealDate("2026-10-24T12:00:00Z").getTime();
  // Every run reads the same time, as two runs started in the same second would.
  globalThis.Date = class extends RealDate {
    constructor(...time: unknown[]) {
      if (time.length === 0) super(fixed);
      else super(...(time as [number]));
    }
    static override now(): number {
      return fixed;
    }
  } as DateConstructor;
  try {
    for (let run = 0; run < 2; run += 1) this.runs.push(await runOid(this.projectDir, args, new ScriptedExecutor(this.projectDir, this.script)));
  } finally {
    globalThis.Date = RealDate;
  }
});

Then("both runs succeed", function (this: RunWorld) {
  for (const run of this.runs as OidRun[]) {
    assert.equal(run.crash, undefined, `A run crashed:\n${String(run.crash)}`);
    assert.equal(run.exitCode, 0, `A run did not succeed. Output:\n${run.output}`);
  }
});

Then("each run has its own branch, with one commit on top of the starting HEAD", function (this: RunWorld) {
  const created = branches(this.projectDir).filter((branch) => !this.branchesBefore.includes(branch));
  assert.equal(created.length, 2, `Expected two branches, got: ${created.join(", ") || "none"}`);
  for (const branch of created) assert.equal(git(this.projectDir, "rev-parse", `${branch}^`), this.startHead);
});

Given("the run will end with the FR built", function () {
  // The background's script builds FR-GREET-01.
});

Given("the run will end on a refusal", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "test", GREET_01_SCENARIO, attemptDir("test-passes-without-code"));
});

Then("the run's worktree is gone", async function (this: RunWorld) {
  const worktrees = git(this.projectDir, "worktree", "list", "--porcelain").split("\n").filter((line) => line.startsWith("worktree "));
  assert.equal(worktrees.length, 1, `The run's worktree is still registered:\n${worktrees.join("\n")}`);
  const runs = join(dirname(this.projectDir), ".oid-worktrees", basename(this.projectDir));
  assert.deepEqual(existsSync(runs) ? await readdir(runs) : [], [], "The run's worktree directory is still there");
});

Then("the run's branch is kept", function (this: RunWorld) {
  runBranch(this);
});

Then("the run's checkpoints are gone, squashed on its branch", function (this: RunWorld) {
  assert.deepEqual(checkpointRefs(this), [], "The built run kept its checkpoints");
});

Then("the run's checkpoints are kept for a later resume", async function (this: RunWorld) {
  const refs = checkpointRefs(this);
  assert.equal(refs.length, 1, `Expected the run's checkpoint ref, got: ${refs.join(", ") || "none"}`);
  const committed = git(this.projectDir, "ls-tree", "-r", "--name-only", refs[0]!).split("\n");
  for (const file of await filesUnder(attemptDir("steps"))) assert.ok(committed.includes(file), `The kept checkpoint does not hold ${file}`);
});
