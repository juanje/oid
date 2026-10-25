import assert from "node:assert/strict";
import { cp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO, OID_ROOT, createGreetProjectWith, git, greet02AttemptDir, greet03AttemptDir, runScenariosAt, scenarioNames } from "../support/fixture.ts";
import { runBranch } from "../support/run.ts";
import type { PreparedAttempt } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

const [FIRST, SECOND] = scenarioNames("greet-02/contract/features/greet-02.feature") as [string, string];
const [WITH] = scenarioNames("greet-03/contract/features/greet-03.feature") as [string];

const attempt = (kind: PreparedAttempt["kind"], scenario: string, dir: string): PreparedAttempt => ({ kind, scenario, dir });
const BUILD_GREET_02 = [
  attempt("steps", FIRST, greet02AttemptDir("s1-steps")),
  attempt("test", FIRST, greet02AttemptDir("s1-test")),
  attempt("code", FIRST, greet02AttemptDir("s1-code")),
  attempt("steps", SECOND, greet02AttemptDir("s2-steps")),
  attempt("test", SECOND, greet02AttemptDir("s2-test")),
  attempt("code", SECOND, greet02AttemptDir("s2-code")),
];
const greet03 = (code: string) => [
  attempt("steps", WITH, greet03AttemptDir("steps")),
  attempt("test", WITH, greet03AttemptDir("test")),
  attempt("code", WITH, greet03AttemptDir(code)),
];

Given("a project where FR-GREET-01 is built and FR-GREET-02 and FR-GREET-03 have approved feature files", async function (this: RunWorld) {
  this.projectDir = await createGreetProjectWith("greet-02");
  await cp(join(OID_ROOT, "fixtures/greet/greet-03/contract"), this.projectDir, { recursive: true });
  git(this.projectDir, "add", "--all");
  git(this.projectDir, "commit", "-q", "-m", "spec: greet-03");
});

Given("a scripted executor that builds FR-GREET-02 and then FR-GREET-03", function (this: RunWorld) {
  this.script = [...BUILD_GREET_02, ...greet03("code")];
});

Given("a scripted executor that builds FR-GREET-02, and whose code attempt for FR-GREET-03 leaves its new test failing", function (this: RunWorld) {
  this.script = [...BUILD_GREET_02, ...greet03("code-wrong")];
});

Given("a scripted executor whose code attempt for FR-GREET-02's first scenario leaves its new test failing", function (this: RunWorld) {
  this.script = [attempt("steps", FIRST, greet02AttemptDir("s1-steps")), attempt("test", FIRST, greet02AttemptDir("s1-test")), attempt("code", FIRST, greet02AttemptDir("s1-code-wrong"))];
});

Given("a scripted executor that builds FR-GREET-02", function (this: RunWorld) {
  this.script = BUILD_GREET_02;
});

Given("FR-GREET-01's code no longer greets as its scenario says", async function (this: RunWorld) {
  await writeFile(join(this.projectDir, "src/greet.ts"), "export function greet(name: string): string {\n  return `Hi, ${name}!`;\n}\n");
  git(this.projectDir, "commit", "-q", "-am", "fix: a friendlier greeting");
});

/** The run's commits on top of the starting HEAD, oldest first, by their subject. */
function commitsOf(world: RunWorld): string[] {
  return git(world.projectDir, "log", "--reverse", "--format=%s", `${world.startHead}..${runBranch(world)}`).split("\n").filter(Boolean);
}

Then("the run's branch has one commit per FR on top of the starting HEAD, FR-GREET-02's first", function (this: RunWorld) {
  const commits = commitsOf(this);
  assert.equal(commits.length, 2, `Expected two commits, found:\n${commits.join("\n")}`);
  assert.match(commits[0]!, /\bFR-GREET-02\b/);
  assert.match(commits[1]!, /\bFR-GREET-03\b/);
});

Then("the run's branch has one commit on top of the starting HEAD, FR-GREET-02's", function (this: RunWorld) {
  const commits = commitsOf(this);
  assert.equal(commits.length, 1, `Expected one commit, found:\n${commits.join("\n")}`);
  assert.match(commits[0]!, /\bFR-GREET-02\b/);
});

Then("the output lists FR-GREET-03's scenario as left out of FR-GREET-02's gate", function (this: RunWorld) {
  const line = this.output.split("\n").find((text) => /\bleaves out\b/.test(text) && text.includes("FR-GREET-02") && text.includes(WITH));
  assert.ok(line !== undefined, `No line says FR-GREET-02's gate leaves out "${WITH}":\n${this.output}`);
});

Then("every scenario of FR-GREET-02 and FR-GREET-03 passes on the run's branch", async function (this: RunWorld) {
  for (const fr of ["FR-GREET-02", "FR-GREET-03"]) {
    const { exitCode, output } = await runScenariosAt(this.projectDir, runBranch(this), `@${fr}`);
    assert.equal(exitCode, 0, `cucumber-js failed on the run's branch for ${fr}:\n${output}`);
  }
});

/** Asserts that the summary marks `fr` with the fixed word `word`. */
function assertMarked(world: RunWorld, fr: string, word: string): void {
  const summary = world.output.slice(world.output.indexOf("Summary of"));
  const line = summary.split("\n").find((text) => new RegExp(`^\\s*${fr}\\b`).test(text));
  assert.ok(line !== undefined && new RegExp(`\\b${word}\\b`).test(line), `The summary does not mark ${fr} as ${word}:\n${summary}`);
}

Then("the summary says FR-GREET-02 was built and FR-GREET-03 stopped", function (this: RunWorld) {
  assertMarked(this, "FR-GREET-02", "built");
  assertMarked(this, "FR-GREET-03", "stopped");
});

Then("the summary says FR-GREET-02 stopped and FR-GREET-03 was not started", function (this: RunWorld) {
  assertMarked(this, "FR-GREET-02", "stopped");
  assertMarked(this, "FR-GREET-03", "not started");
});

Then("the output names FR-GREET-01's scenario and its failure", function (this: RunWorld) {
  assert.ok(this.output.includes(GREET_01_SCENARIO), `The output does not name "${GREET_01_SCENARIO}":\n${this.output}`);
  assert.match(this.output, /Hi, Ada!/, `The output does not give the scenario's failure:\n${this.output}`);
});
