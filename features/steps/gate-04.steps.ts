import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import { createGreetProjectWith, greet03AttemptDir, scenarioNames } from "../support/fixture.ts";
import { assertOutputNames, requestsOf } from "../support/run.ts";
import type { PreparedAttempt } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

// The FR-GREET-02 scenario that only greetPair serves, which no unit test covers.
const [BROKEN] = scenarioNames("greet-02/contract/features/greet-02.feature") as [string];

/** The script with FR-GREET-03's code attempt breaking greetPair, then the code attempt after the gate answered by `after`. */
function codeThenAfterGate(script: PreparedAttempt[], after: string): PreparedAttempt[] {
  return script.flatMap((attempt) =>
    attempt.kind === "code" ? [{ ...attempt, dir: greet03AttemptDir("code-breaks-pair") }, { ...attempt, dir: greet03AttemptDir(after) }] : [attempt],
  );
}

Given("a project where FR-GREET-01 and FR-GREET-02 are built and FR-GREET-03 has an approved feature file", async function (this: RunWorld) {
  this.projectDir = await createGreetProjectWith("greet-03", { greet02Built: true });
});

Given(
  "the scripted code attempt for FR-GREET-03 breaks a scenario of FR-GREET-02 that no unit test covers, and its retry does not",
  function (this: RunWorld) {
    this.script = codeThenAfterGate(this.script, "code-fixes-pair");
  },
);

Given(
  "the scripted code attempt for FR-GREET-03 breaks a scenario of FR-GREET-02 that no unit test covers, and so does its retry",
  function (this: RunWorld) {
    this.script = codeThenAfterGate(this.script, "code-breaks-pair");
  },
);

Then("the retried code attempt was given the gate's failure, naming the scenario of FR-GREET-02 it broke", function (this: RunWorld) {
  const refusal = requestsOf(this, "code", 2)[1]!.refusal;
  assert.ok(refusal !== undefined, "The code attempt after the gate came without the gate's refusal");
  // The task's focus is the scenario the gate found failing, not the scenario the attempt belongs to.
  assert.deepEqual(
    refusal.focus?.scenarios.map((scenario) => scenario.name),
    [BROKEN],
    `The refusal's focus is not the broken scenario:\n${JSON.stringify(refusal)}`,
  );
  assert.ok(refusal.evidence.includes(BROKEN), `The refusal's evidence does not name "${BROKEN}"`);
});

Then("the output names the scenario of FR-GREET-02 that fails", function (this: RunWorld) {
  assertOutputNames(this, BROKEN);
});
