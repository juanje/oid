import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import { commitFixture, commitProjectConfig, greet02AttemptDir, refDir, scenarioNames } from "../support/fixture.ts";
import type { PreparedAttempt } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

const [FIRST, SECOND] = scenarioNames("greet-02/contract/features/greet-02.feature") as [string, string];

/** The attempts that build both scenarios of FR-GREET-02, with the second scenario's test and code swapped in. */
function buildWith(test: string, code: string): PreparedAttempt[] {
  return [
    { kind: "steps", scenario: FIRST, dir: greet02AttemptDir("s1-steps") },
    { kind: "test", scenario: FIRST, dir: greet02AttemptDir("s1-test") },
    { kind: "code", scenario: FIRST, dir: greet02AttemptDir("s1-code") },
    { kind: "steps", scenario: SECOND, dir: greet02AttemptDir("s2-steps") },
    { kind: "test", scenario: SECOND, dir: test },
    { kind: "code", scenario: SECOND, dir: code },
  ];
}

Given(
  "the scripted code attempt for FR-GREET-02 copies the greeting function's name check into its new function, with other names and another message",
  async function (this: RunWorld) {
    await commitFixture(this.projectDir, refDir("greet-checks-name"), "feat(FR-GREET-01): refuse an empty or overlong name");
    this.script = buildWith(refDir("s2-test-checks"), refDir("s2-code-copies-check"));
  },
);

Given("the scripted cleanup attempt extracts the shared check", function (this: RunWorld) {
  this.script = [...this.script, { kind: "refactor-code", scenario: SECOND, dir: refDir("cleanup-extracts") }];
});

/** The task of the one cleanup attempt the executor was asked for. */
function cleanupTask(world: RunWorld): string {
  const requests = world.executor?.requests ?? [];
  const at = requests.findIndex((request) => request.kind === "refactor-code");
  assert.notEqual(at, -1, "The executor was not asked for a cleanup attempt");
  return world.executor!.told[at]!.task;
}

Then("the cleanup attempt's task names a duplication between the greeting function and the new function", function (this: RunWorld) {
  const task = cleanupTask(this);
  assert.match(task, /\bduplication\b/, `The cleanup attempt's task names no duplication:\n${task}`);
  assert.match(task, /\bgreet\b/, `The cleanup attempt's task does not name the greeting function:\n${task}`);
  assert.match(task, /\bgreetAll\b/, `The cleanup attempt's task does not name the new function:\n${task}`);
});

Given("the source of FR-GREET-01 already repeats a block that FR-GREET-02's code does not touch", async function (this: RunWorld) {
  await commitFixture(this.projectDir, refDir("repeated-records"), "feat: two records that repeat a block");
  this.script = buildWith(greet02AttemptDir("s2-test"), greet02AttemptDir("s2-code"));
});

Then("the executor was not asked for a cleanup attempt", function (this: RunWorld) {
  const asked = (this.executor?.requests ?? []).filter((request) => request.kind === "refactor-code");
  assert.equal(asked.length, 0, `The executor was asked for ${asked.length} cleanup attempts`);
});

Given("the project's complexity limit is {int}", async function (this: RunWorld, limit: number) {
  await commitProjectConfig(this.projectDir, (config) => (config.limits = { ...config.limits, complexity: limit }), "chore: the project's complexity limit");
});

Given("the scripted code attempt for FR-GREET-02 writes a new function with complexity 5", function (this: RunWorld) {
  this.script = buildWith(refDir("s2-test-sizes"), refDir("s2-code-complex"));
});

Given("the scripted cleanup attempt splits that function", function (this: RunWorld) {
  this.script = [...this.script, { kind: "refactor-code", scenario: SECOND, dir: refDir("cleanup-splits") }];
});

Then("the cleanup attempt's task names the new function's complexity", function (this: RunWorld) {
  const task = cleanupTask(this);
  assert.match(task, /\bcomplexity\b/, `The cleanup attempt's task names no complexity:\n${task}`);
  assert.match(task, /\bjoinNames\b/, `The cleanup attempt's task does not name the new function:\n${task}`);
});

Given("FR-GREET-01's greeting function already has complexity 5", async function (this: RunWorld) {
  await commitFixture(this.projectDir, refDir("greet-complex"), "feat(FR-GREET-01): greetings for special names");
});

Given("the scripted code attempt for FR-GREET-02 changes a line of the greeting function without adding a decision", function (this: RunWorld) {
  this.script = buildWith(greet02AttemptDir("s2-test"), refDir("s2-code-touches-greet"));
});
