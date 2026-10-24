import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { attemptDir, branches, createGreetProject, filesUnder, git, runScenariosAt } from "../support/fixture.ts";
import { scriptedExecutor } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

Given("a project with an approved feature file for FR-GREET-01", async function (this: RunWorld) {
  this.projectDir = await createGreetProject();
});

Given("a scripted executor whose steps, test and code attempts build FR-GREET-01", function (this: RunWorld) {
  this.attempts = { steps: attemptDir("steps"), test: attemptDir("test"), code: attemptDir("code") };
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
  const write = (text: string): void => {
    this.output += text;
  };
  try {
    this.exitCode = await runCli(args, {
      cwd: this.projectDir,
      executor: scriptedExecutor(this.projectDir, this.attempts),
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

/** The one branch the run created. */
function runBranch(world: RunWorld): string {
  const created = branches(world.projectDir).filter((branch) => !world.branchesBefore.includes(branch));
  assert.equal(created.length, 1, `Expected the run to create one branch, it created: ${created.join(", ") || "none"}`);
  return created[0]!;
}

Then("the run's branch has exactly one commit on top of the starting HEAD", function (this: RunWorld) {
  const branch = runBranch(this);
  const commits = git(this.projectDir, "rev-list", `${this.startHead}..${branch}`).split("\n").filter(Boolean);
  assert.equal(commits.length, 1, `Expected one commit on ${branch}, found ${commits.length}`);
  assert.equal(git(this.projectDir, "rev-parse", `${branch}^`), this.startHead);
});

Then("that commit holds the FR's step definitions, unit test and source", async function (this: RunWorld) {
  const changed = git(this.projectDir, "diff", "--name-only", this.startHead, runBranch(this)).split("\n");
  for (const kind of ["steps", "test", "code"] as const) {
    for (const file of await filesUnder(this.attempts[kind]!)) {
      assert.ok(changed.includes(file), `The commit does not hold ${file}. It holds:\n${changed.join("\n")}`);
    }
  }
});

Then("every scenario of FR-GREET-01 passes on the run's branch", async function (this: RunWorld) {
  const { exitCode, output } = await runScenariosAt(this.projectDir, runBranch(this), "@FR-GREET-01");
  assert.equal(exitCode, 0, `cucumber-js failed on the run's branch:\n${output}`);
  const summary = /(\d+) scenarios? \((\d+) passed\)/.exec(output);
  assert.ok(summary !== null && Number(summary[1]) > 0 && summary[1] === summary[2], `Not every scenario passed:\n${output}`);
});

Then("the feature file of FR-GREET-01 is unchanged on the run's branch", function (this: RunWorld) {
  const diff = git(this.projectDir, "diff", "--name-only", this.startHead, runBranch(this), "--", "features/greet-01.feature");
  assert.equal(diff, "", "The run changed the feature file of FR-GREET-01");
});
