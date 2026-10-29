import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import { filesUnder, git, refDir, runScenariosAt, runUnitTestsAt, scenarioNames } from "../support/fixture.ts";
import { cleanupTask, requestsOf, runBranch, runLog } from "../support/run.ts";
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

/** The one cleanup line of the run's output (DOMAIN.md, Progress lines). */
function cleanupLine(world: RunWorld): string {
  const lines = world.output.split("\n").filter((line) => line.startsWith("cleanup "));
  assert.equal(lines.length, 1, `Expected one cleanup line in the output:\n${world.output}`);
  return lines[0]!;
}

Then("the output reports the cleanup item as accepted", function (this: RunWorld) {
  const line = cleanupLine(this);
  assert.match(line, /: accepted\b/, `The cleanup line does not say accepted:\n${line}`);
});

Then("the output reports the cleanup item as not accepted", function (this: RunWorld) {
  const line = cleanupLine(this);
  assert.match(line, /: not accepted\b/, `The cleanup line does not say not accepted:\n${line}`);
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

Given(
  "the scripted cleanup attempt extracts part of the shared check, leaving a shorter copy in both functions, and its retry extracts the rest",
  function (this: RunWorld) {
    cleanupWith(this, "cleanup-extracts-part");
    cleanupWith(this, "cleanup-extracts");
  },
);

Then("the retried cleanup attempt was given a refusal that says the duplication is still there, naming both functions", function (this: RunWorld) {
  const refusal = requestsOf(this, "refactor-code", 2)[1]!.refusal;
  assert.ok(refusal !== undefined, "The retried cleanup attempt came without a refusal");
  assert.match(refusal.failed, /still there/, `The refusal does not say the finding is still there:\n${refusal.failed}`);
  assert.match(refusal.evidence, /\bduplication\b/, `The refusal's evidence names no duplication:\n${refusal.evidence}`);
  for (const name of ["greet", "greetAll"]) {
    assert.ok(refusal.evidence.includes(`(${name})`), `The refusal's evidence does not name ${name}:\n${refusal.evidence}`);
  }
});

Then("the retried cleanup attempt was given the refused attempt's diff", function (this: RunWorld) {
  const tasks = this.executor!.told.filter((_, at) => this.executor!.requests[at]!.kind === "refactor-code").map(({ task }) => task);
  assert.equal(tasks.length, 2, `Expected 2 cleanup attempts, got ${tasks.length}`);
  // The refused attempt's diff, as git shows it: the helper it added and the call that replaced each copy's check.
  for (const line of ["+export function requireName(name: string): void {", "+  requireName(trimmed);", "+    requireName(cleaned);"]) {
    assert.ok(tasks[1]!.includes(line), `The retried cleanup attempt's task does not hold the refused diff's line "${line}":\n${tasks[1]}`);
  }
});

Given("the scripted cleanup attempt removes the copy from the new function and repeats the check in a third function", function (this: RunWorld) {
  cleanupWith(this, "cleanup-moves-duplication");
});

Then("the run's log gives the cleanup's refusal as a new finding", async function (this: RunWorld) {
  const cleanups = (await runLog(this)).filter((event) => event.event === "cleanup");
  assert.equal(cleanups.length, 1, `Expected one cleanup in the run's log, found ${cleanups.length}`);
  const [cleanup] = cleanups;
  assert.ok(cleanup?.event === "cleanup" && cleanup.failed !== undefined, `The cleanup in the run's log has no refusal: ${JSON.stringify(cleanup)}`);
  assert.match(cleanup.failed, /new finding/, `The cleanup's refusal is not a new finding: ${cleanup.failed}`);
});

// The source's functions when the cleanup starts, as their signatures read in it: FR-GREET-01's name check, the
// function it calls, and FR-GREET-02's copy.
const SOURCE_SIGNATURES = ["greet(name: string): string", "lettersIn(name: string): number", "greetAll(names: string[]): string", "greetPair(first: string, second: string): string"];

Then("the cleanup attempt's task names every function of the source with its signature", function (this: RunWorld) {
  const task = cleanupTask(this);
  for (const signature of SOURCE_SIGNATURES) assert.ok(task.includes(signature), `The cleanup attempt's task does not give "${signature}":\n${task}`);
});

Then("the cleanup attempt's task holds the body of each function the copied check calls", async function (this: RunWorld) {
  const task = cleanupTask(this);
  // The check calls lettersIn, in both copies.
  const body = (await readFile(join(refDir("greet-checks-name"), "src/letters.ts"), "utf8")).split("\n").filter((line) => !line.startsWith("/**")).join("\n").trimEnd();
  assert.ok(task.includes(body), `The cleanup attempt's task does not hold the body of lettersIn:\n${body}\n\nTask:\n${task}`);
});

const MESSAGES_DIFFER = "The two copies refuse with different messages: greet says \"A greeting needs a name\", greetAll says \"Nobody to greet\". The SPEC does not say a group should be refused otherwise.";

Given(
  "the scripted cleanup attempt extracts the shared check, with the message as a parameter, and reports a note that the two messages differ",
  function (this: RunWorld) {
    this.script = [...this.script, { kind: "refactor-code", scenario: SECOND, dir: refDir("cleanup-extracts-with-message"), note: MESSAGES_DIFFER }];
  },
);

Then("the output lists the cleanup's note that the two messages differ", function (this: RunWorld) {
  const at = this.output.indexOf(MESSAGES_DIFFER);
  assert.notEqual(at, -1, `The output does not give the cleanup's note:\n${this.output}`);
  assert.match(this.output.slice(Math.max(0, at - 200), at), /\bnotes?\b/i, `The output does not give the cleanup's note as a note:\n${this.output}`);
});
