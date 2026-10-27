import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import { filesUnder, git, refDir, runScenariosAt, runUnitTestsAt, scenarioNames } from "../support/fixture.ts";
import { runBranch } from "../support/run.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunWorld } from "../support/world.ts";

const SECOND = scenarioNames("greet-02/contract/features/greet-02.feature")[1]!;

function cleanupWith(world: RunWorld, dir: string): void {
  world.script = [...world.script, { kind: "refactor-code", scenario: SECOND, dir: refDir(dir) }];
}

Given("the scripted cleanup attempt extracts the shared check into a helper that both functions call", function (this: RunWorld) {
  cleanupWith(this, "cleanup-extracts");
});

Given("the scripted cleanup attempt edits a unit test", function (this: RunWorld) {
  cleanupWith(this, "cleanup-edits-test");
});

Given("the scripted cleanup attempt breaks a scenario", function (this: RunWorld) {
  cleanupWith(this, "cleanup-breaks-scenario");
});

Given("the scripted cleanup attempt changes the signature of an exported function", function (this: RunWorld) {
  cleanupWith(this, "cleanup-changes-signature");
});

Given("the scripted cleanup attempt leaves the duplication in place", function (this: RunWorld) {
  cleanupWith(this, "cleanup-leaves-duplication");
});

Given("the scripted cleanup attempt adds another duplication", function (this: RunWorld) {
  cleanupWith(this, "cleanup-adds-duplication");
});

Given("the scripted cleanup attempt leaves a branch that no test runs", function (this: RunWorld) {
  cleanupWith(this, "cleanup-untaken-branch");
});

Given("the scripted cleanup attempt makes the new function more complex than it was", function (this: RunWorld) {
  cleanupWith(this, "cleanup-more-complex");
});

/** The source files of the FR's commit, by path. */
function committedSource(world: RunWorld): Map<string, string> {
  const branch = runBranch(world);
  const files = git(world.projectDir, "ls-tree", "-r", "--name-only", branch).split("\n").filter((file) => file.startsWith("src/"));
  return new Map(files.map((file) => [file, git(world.projectDir, "show", `${branch}:${file}`)]));
}

Then("the FR's commit has the name check in one place", function (this: RunWorld) {
  const checks = [...committedSource(this)].filter(([, text]) => text.includes(".trim()"));
  assert.equal(checks.length, 1, `The name check (.trim()) is in ${checks.length} committed source files, not one: ${checks.map(([file]) => file).join(", ")}`);
});

Then("every scenario and unit test passes on the run's branch", async function (this: RunWorld) {
  const branch = runBranch(this);
  const scenarios = await runScenariosAt(this.projectDir, branch, "@FR-GREET-01 or @FR-GREET-02");
  assert.equal(scenarios.exitCode, 0, `cucumber-js failed on the run's branch:\n${scenarios.output}`);
  const units = await runUnitTestsAt(this.projectDir, branch);
  assert.equal(units.exitCode, 0, `vitest failed on the run's branch:\n${units.output}`);
});

Then("the output reports the cleanup item as accepted", function (this: RunWorld) {
  const lines = this.output.split("\n").filter((line) => line.startsWith("cleanup "));
  assert.equal(lines.length, 1, `Expected one cleanup line in the output:\n${this.output}`);
  assert.match(lines[0]!, /: accepted\b/, `The cleanup line does not say accepted:\n${lines[0]}`);
});

Then("the output reports the cleanup item as not accepted", function (this: RunWorld) {
  const lines = this.output.split("\n").filter((line) => line.startsWith("cleanup "));
  assert.equal(lines.length, 1, `Expected one cleanup line in the output:\n${this.output}`);
  assert.match(lines[0]!, /: not accepted\b/, `The cleanup line does not say not accepted:\n${lines[0]}`);
});

Then("the FR's commit has the code the code attempt left", async function (this: RunWorld) {
  const branch = runBranch(this);
  for (const file of await filesUnder(refDir("s2-code-copies-check"))) {
    assert.equal(
      git(this.projectDir, "show", `${branch}:${file}`),
      (await readFile(join(refDir("s2-code-copies-check"), file), "utf8")).trimEnd(),
      `${file} on the run's branch is not what the code attempt left`,
    );
  }
  assert.equal(git(this.projectDir, "show", `${branch}:src/greet.ts`), git(this.projectDir, "show", `${this.startHead}:src/greet.ts`), "The cleanup's change to src/greet.ts reached the commit");
  const files = git(this.projectDir, "ls-tree", "-r", "--name-only", branch).split("\n");
  assert.ok(!files.includes("src/name-check.ts"), "The refused cleanup's helper reached the commit");
});
