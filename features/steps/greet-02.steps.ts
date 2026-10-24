import assert from "node:assert/strict";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { attemptDir, createGreet02Project, greet02AttemptDir, scenarioNames, testNames } from "../support/fixture.ts";
import { lastAttempt, type PreparedAttempt } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

const [FIRST, SECOND] = scenarioNames("greet-02/contract/features/greet-02.feature") as [string, string];

/** The attempts for one scenario of FR-GREET-02, by the names of their prepared directories. */
function attempts(scenario: string, ...prepared: [PreparedAttempt["kind"], string][]): PreparedAttempt[] {
  return prepared.map(([kind, name]) => ({ kind, scenario, dir: greet02AttemptDir(name) }));
}

const BUILD_FIRST = attempts(FIRST, ["steps", "s1-steps"], ["test", "s1-test"], ["code", "s1-code"]);
const BUILD_SECOND = attempts(SECOND, ["steps", "s2-steps"], ["test", "s2-test"], ["code", "s2-code"]);

Given("a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios", async function (this: RunWorld) {
  this.projectDir = await createGreet02Project();
});

Given("a scripted executor that builds the first scenario of FR-GREET-02 and then the second", function (this: RunWorld) {
  this.script = [...BUILD_FIRST, ...BUILD_SECOND];
});

Then("the executor was asked for every prepared attempt, in order", function (this: RunWorld) {
  // Each request was checked against the next prepared attempt as it came; what is left is that none was skipped.
  assert.ok(this.executor !== undefined, "The run never got an executor");
  assert.equal(this.executor.asked, this.executor.prepared, `The executor was asked for ${this.executor.asked} of ${this.executor.prepared} prepared attempts`);
});

Given("the scripted steps attempt for the first scenario writes step definitions that pass without code", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "steps", FIRST, greet02AttemptDir("s1-steps-pass"));
});

Then("the output names the scenario that passed without its code", function (this: RunWorld) {
  assert.ok(this.output.includes(FIRST), `The output does not name "${FIRST}":\n${this.output}`);
});

Given("the first scenario of FR-GREET-02 still fails after its first test and code attempts", function (this: RunWorld) {
  // The first round builds a helper only; the second builds what the scenario calls.
  const twoRounds = attempts(
    FIRST,
    ["steps", "s1-steps"],
    ["test", "s1-test-names"],
    ["code", "s1-code-names"],
    ["test", "s1-test"],
    ["code", "s1-code-uses-names"],
  );
  this.script = [...twoRounds, ...BUILD_SECOND];
});

Given("the scripted code attempt for the first scenario leaves its new test failing", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "code", FIRST, greet02AttemptDir("s1-code-wrong"));
});

Then("the output names the test that still fails", function (this: RunWorld) {
  const [name] = testNames(join(greet02AttemptDir("s1-test"), "tests/greet-all.test.ts"));
  assert.ok(name !== undefined && this.output.includes(name), `The output does not name "${name}":\n${this.output}`);
});

/** The second scenario's first round: a helper and its test, with code that also breaks something that was green. */
function secondScenarioBreaking(code: string): PreparedAttempt[] {
  return attempts(SECOND, ["steps", "s2-steps"], ["test", "s2-test-names"], ["code", code]);
}

Given("the scripted code attempt for the second scenario breaks the unit test of FR-GREET-01", function (this: RunWorld) {
  this.script = [...BUILD_FIRST, ...secondScenarioBreaking("s2-code-names-breaks-greet")];
});

Then("the output names the unit test that turned red", function (this: RunWorld) {
  const [name] = testNames(join(attemptDir("test"), "tests/greet.test.ts"));
  assert.ok(name !== undefined && this.output.includes(name), `The output does not name "${name}":\n${this.output}`);
});

Given("the scripted code attempt for the second scenario breaks the first scenario of FR-GREET-02, and no unit test", function (this: RunWorld) {
  this.script = [...BUILD_FIRST, ...secondScenarioBreaking("s2-code-names-breaks-pair")];
});

Then("the output names the scenario that turned red", function (this: RunWorld) {
  assert.ok(this.output.includes(FIRST), `The output does not name "${FIRST}":\n${this.output}`);
});
