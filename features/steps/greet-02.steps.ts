import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import { createGreet02Project, greet02AttemptDir, scenarioNames } from "../support/fixture.ts";
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
