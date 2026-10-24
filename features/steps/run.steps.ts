import assert from "node:assert/strict";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { GREET_01_SCENARIO, attemptDir, branches, createGreetProject, filesUnder, git, runScenariosAt, testNames } from "../support/fixture.ts";
import { assertOutputNames, attemptOf, runBranch } from "../support/run.ts";
import { ScriptedExecutor, lastAttempt } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

Given("a project with an approved feature file for FR-GREET-01", async function (this: RunWorld) {
  this.projectDir = await createGreetProject();
});


Given("a scripted executor whose steps, test and code attempts build FR-GREET-01", function (this: RunWorld) {
  this.script = (["steps", "test", "code"] as const).map((kind) => ({ kind, scenario: GREET_01_SCENARIO, dir: attemptDir(kind) }));
});

Given("the run allows no retries", async function (this: RunWorld) {
  await writeFile(join(this.projectDir, ".oid.json"), `${JSON.stringify({ limits: { retries: 0 } }, null, 2)}\n`);
  git(this.projectDir, "add", ".oid.json");
  git(this.projectDir, "commit", "-q", "-m", "chore: oid config");
});

When("I run {string}", async function (this: RunWorld, command: string) {
  const [program, ...args] = command.split(" ");
  assert.equal(program, "oid");
  this.startHead = git(this.projectDir, "rev-parse", "HEAD");
  this.branchesBefore = branches(this.projectDir);
  // A dynamic import, so that a missing CLI fails this step and not the whole load.
  const { runCli } = await import("../../src/cli.ts");
  this.executor = new ScriptedExecutor(this.projectDir, this.script);
  const write = (text: string): void => {
    this.output += text;
  };
  try {
    this.exitCode = await runCli(args, {
      cwd: this.projectDir,
      executor: this.executor,
      stdout: write,
      stderr: write,
    });
  } catch (error) {
    this.crash = error;
  }
});

Then("the run succeeds", function (this: RunWorld) {
  assert.equal(this.crash, undefined, `The run crashed:\n${String(this.crash)}`);
  assert.equal(this.exitCode, 0, `The run did not succeed. Output:\n${this.output}`);
});

Then("the run's branch has exactly one commit on top of the starting HEAD", function (this: RunWorld) {
  const branch = runBranch(this);
  const commits = git(this.projectDir, "rev-list", `${this.startHead}..${branch}`).split("\n").filter(Boolean);
  assert.equal(commits.length, 1, `Expected one commit on ${branch}, found ${commits.length}`);
  assert.equal(git(this.projectDir, "rev-parse", `${branch}^`), this.startHead);
});

Then("that commit holds the FR's step definitions, unit test and source", async function (this: RunWorld) {
  const changed = git(this.projectDir, "diff", "--name-only", this.startHead, runBranch(this)).split("\n");
  for (const attempt of this.script) {
    for (const file of await filesUnder(attempt.dir)) {
      assert.ok(changed.includes(file), `The commit does not hold ${file}. It holds:\n${changed.join("\n")}`);
    }
  }
});

Then("every scenario of {word} passes on the run's branch", async function (this: RunWorld, fr: string) {
  const { exitCode, output } = await runScenariosAt(this.projectDir, runBranch(this), `@${fr}`);
  assert.equal(exitCode, 0, `cucumber-js failed on the run's branch:\n${output}`);
  const summary = /(\d+) scenarios? \((\d+) passed\)/.exec(output);
  assert.ok(summary !== null && Number(summary[1]) > 0 && summary[1] === summary[2], `Not every scenario passed:\n${output}`);
});

Then("the feature file of FR-GREET-01 is unchanged on the run's branch", function (this: RunWorld) {
  const diff = git(this.projectDir, "diff", "--name-only", this.startHead, runBranch(this), "--", "features/greet-01.feature");
  assert.equal(diff, "", "The run changed the feature file of FR-GREET-01");
});

const MY_CHANGES = { tracked: "SPEC.md", untracked: "notes.txt" };

Given("I have an uncommitted change in my working copy", async function (this: RunWorld) {
  await appendFile(join(this.projectDir, MY_CHANGES.tracked), "\nA line I have not committed.\n");
  await writeFile(join(this.projectDir, MY_CHANGES.untracked), "My notes.\n");
  this.workingCopyBefore = await workingCopy(this.projectDir);
});

/** What the person sees of their working copy: status, branch, HEAD and the content of the files they changed. */
async function workingCopy(dir: string): Promise<Record<string, string>> {
  return {
    status: git(dir, "status", "--porcelain"),
    branch: git(dir, "branch", "--show-current"),
    head: git(dir, "rev-parse", "HEAD"),
    tracked: await readFile(join(dir, MY_CHANGES.tracked), "utf8"),
    untracked: await readFile(join(dir, MY_CHANGES.untracked), "utf8"),
  };
}

Then("my working copy, its current branch and its HEAD are as they were", async function (this: RunWorld) {
  assert.deepEqual(await workingCopy(this.projectDir), this.workingCopyBefore);
});

Then("the run's commit does not contain my uncommitted change", function (this: RunWorld) {
  const branch = runBranch(this);
  assert.equal(
    git(this.projectDir, "show", `${branch}:${MY_CHANGES.tracked}`),
    git(this.projectDir, "show", `${this.startHead}:${MY_CHANGES.tracked}`),
    `The run's commit holds my uncommitted change to ${MY_CHANGES.tracked}`,
  );
  const files = git(this.projectDir, "ls-tree", "-r", "--name-only", branch).split("\n");
  assert.ok(!files.includes(MY_CHANGES.untracked), `The run's commit holds my untracked ${MY_CHANGES.untracked}`);
});

Given("the scripted test attempt writes a test that passes without its code", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "test", GREET_01_SCENARIO, attemptDir("test-passes-without-code"));
});

Then("the run stops with a refusal, not a crash", function (this: RunWorld) {
  // In-process, a crash is a thrown error; a refusal is a returned exit code of 1.
  assert.equal(this.crash, undefined, `The run crashed:\n${String(this.crash)}`);
  assert.equal(this.exitCode, 1, `The run did not stop with a refusal. Output:\n${this.output}`);
});

Then("the output names the test that passed without its code", async function (this: RunWorld) {
  assertOutputNames(this, testNames(join(attemptOf(this.script, "test").dir, "tests/greet.test.ts"))[0]);
});

Then("the run's branch has no commit on top of the starting HEAD", function (this: RunWorld) {
  const branch = runBranch(this);
  assert.equal(git(this.projectDir, "rev-parse", branch), this.startHead, `The run committed on ${branch}`);
});

Given("the scripted code attempt passes the tests but leaves a type error", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "code", GREET_01_SCENARIO, attemptDir("code-type-error"));
});

Then("the output names the type check and the file with the error", async function (this: RunWorld) {
  // The gate's check is named "types"; tsc's message for the fixture's error says "type", so it cannot pass this alone.
  assert.match(this.output, /\btypes\b/i, `The output does not name the type check:\n${this.output}`);
  for (const file of await filesUnder(attemptOf(this.script, "code").dir)) {
    assertOutputNames(this, file);
  }
});

