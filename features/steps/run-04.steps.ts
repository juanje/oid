import assert from "node:assert/strict";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO, OID_ROOT, attemptDir, git, greet02AttemptDir, scenarioNames } from "../support/fixture.ts";
import { requestsOf } from "../support/run.ts";
import type { PreparedAttempt } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

const [FIRST, SECOND] = scenarioNames("greet-02/contract/features/greet-02.feature") as [string, string];
const STEPS_ASKED = "The scenario fails in the shared Then step, which checks the greeting of the name the When step kept: a steps attempt must make it check the greeting the scenario got";

Given("FR-GREET-01's shared Then step checks the greeting of the name its When step kept, not the greeting the scenario got", async function (this: RunWorld) {
  await cp(join(OID_ROOT, "fixtures/greet/greet-02/shared-then-checks-name"), this.projectDir, { recursive: true });
  git(this.projectDir, "add", "--all");
  git(this.projectDir, "commit", "-q", "-m", "test: FR-GREET-01's shared Then step");
});

Given("the scripted code attempt for the first scenario of FR-GREET-02 asks for a steps attempt, saying why", function (this: RunWorld) {
  this.script = [
    { kind: "steps", scenario: FIRST, dir: greet02AttemptDir("s1-steps") },
    { kind: "test", scenario: FIRST, dir: greet02AttemptDir("s1-test") },
    { kind: "code", scenario: FIRST, dir: greet02AttemptDir("s1-code"), next: { kind: "steps", reason: STEPS_ASKED } },
  ];
});

/** FR-GREET-02's second scenario, built as usual. */
const BUILD_SECOND: PreparedAttempt[] = [
  { kind: "steps", scenario: SECOND, dir: greet02AttemptDir("s2-steps") },
  { kind: "test", scenario: SECOND, dir: greet02AttemptDir("s2-test") },
  { kind: "code", scenario: SECOND, dir: greet02AttemptDir("s2-code") },
];

Given("the scripted steps attempt it asks for fixes the shared Then step", function (this: RunWorld) {
  // FR-GREET-01's own step definitions, whose Then step checks the greeting the scenario got.
  this.script = [...this.script, { kind: "steps", scenario: FIRST, dir: attemptDir("steps") }, ...BUILD_SECOND];
});

Given("the scripted steps attempt it asks for changes the shared steps so that FR-GREET-01's scenario fails", function (this: RunWorld) {
  this.script = [...this.script, { kind: "steps", scenario: FIRST, dir: greet02AttemptDir("steps-breaks-greet-01") }];
});

Given("the scripted code attempt for the second scenario asks for a steps attempt, which loosens the shared Then step", function (this: RunWorld) {
  this.script = [
    ...this.script.filter((attempt) => attempt.scenario !== SECOND),
    { kind: "steps", scenario: SECOND, dir: greet02AttemptDir("s2-steps") },
    { kind: "test", scenario: SECOND, dir: greet02AttemptDir("s2-test") },
    { kind: "code", scenario: SECOND, dir: greet02AttemptDir("s2-code"), next: { kind: "steps", reason: "The shared Then step is too strict" } },
    { kind: "steps", scenario: SECOND, dir: greet02AttemptDir("steps-loosened") },
  ];
});

Then("the steps attempt asked for was given the reason and the scenario's failure", function (this: RunWorld) {
  const asked = requestsOf(this, "steps", 3)[1]!;
  assert.deepEqual(asked.asked, { by: "code", reason: STEPS_ASKED }, "The steps attempt asked for did not come with who asked for it and why");
  assert.ok(asked.failure !== undefined && asked.failure.step.startsWith("I get "), `The steps attempt asked for did not come with the scenario's failure at its Then step: ${JSON.stringify(asked.failure)}`);
});

Then("the summary counts one request, and one attempt asked for accepted", function (this: RunWorld) {
  assert.match(this.output, /\brequests that changed the next kind 1 of \d+ \(accepted 1\)/, `The summary does not count one request and one accepted:\n${this.output}`);
});

/** The refusal the run stopped with. */
function finalRefusal(world: RunWorld): string {
  return world.output.slice(world.output.lastIndexOf("Refused: "));
}

Then("the output names FR-GREET-01's scenario as one that turned red", function (this: RunWorld) {
  const refusal = finalRefusal(this);
  assert.ok(refusal.includes(GREET_01_SCENARIO), `The refusal does not name "${GREET_01_SCENARIO}":\n${this.output}`);
});

Then("the output names the second scenario as passing on the code from before its own", function (this: RunWorld) {
  const refusal = finalRefusal(this);
  assert.ok(refusal.includes(SECOND) && /\bpass/.test(refusal), `The refusal does not name "${SECOND}" as passing on the code from before its own:\n${this.output}`);
});

const TEST_ASKED = "Two tests contradict each other: one wants no comma before and, the other a comma; a test attempt must make them agree";
const CONTRADICTING = "greets three people with a comma before and";

Given("the scripted test attempt for the second scenario writes two tests that contradict each other, and its code attempt asks for a test attempt, saying why", function (this: RunWorld) {
  this.script = [
    ...this.script.filter((attempt) => attempt.scenario !== SECOND),
    { kind: "steps", scenario: SECOND, dir: greet02AttemptDir("s2-steps") },
    { kind: "test", scenario: SECOND, dir: greet02AttemptDir("s2-test-contradicting") },
    { kind: "code", scenario: SECOND, dir: greet02AttemptDir("s2-code"), next: { kind: "test", reason: TEST_ASKED } },
  ];
});

Given("the scripted test attempt it asks for changes the second test so that it agrees with the first and still fails on the code from before", function (this: RunWorld) {
  this.script = [
    ...this.script,
    { kind: "test", scenario: SECOND, dir: greet02AttemptDir("s2-test-agreeing") },
    { kind: "code", scenario: SECOND, dir: greet02AttemptDir("s2-code") },
  ];
});

Given("the scripted test attempt it asks for loosens the second test so that it passes on the code from before", function (this: RunWorld) {
  this.script = [...this.script, { kind: "test", scenario: SECOND, dir: greet02AttemptDir("s2-test-loosened") }];
});

Given("the scripted test attempt it asks for removes the second test", function (this: RunWorld) {
  // The second scenario's usual test file holds the first test alone.
  this.script = [...this.script, { kind: "test", scenario: SECOND, dir: greet02AttemptDir("s2-test") }];
});

Then("the test attempt asked for was given the reason", function (this: RunWorld) {
  const asked = requestsOf(this, "test", 3)[2]!;
  assert.deepEqual(asked.asked, { by: "code", reason: TEST_ASKED }, "The test attempt asked for did not come with who asked for it and why");
});

Then("the summary counts two requests, and two attempts asked for accepted", function (this: RunWorld) {
  assert.match(this.output, /\brequests that changed the next kind 2 of \d+ \(accepted 2\)/, `The summary does not count two requests and two accepted:\n${this.output}`);
});

Then("the output names the second test as passing before its code", function (this: RunWorld) {
  const refusal = finalRefusal(this);
  assert.ok(refusal.includes(CONTRADICTING) && /\bpass/.test(refusal), `The refusal does not name "${CONTRADICTING}" as passing before its code:\n${this.output}`);
});

Then("the output says the attempt left fewer unit tests", function (this: RunWorld) {
  assert.match(finalRefusal(this), /\bfewer unit tests\b/, `The refusal does not say the attempt left fewer unit tests:\n${this.output}`);
});

Given("the scripted steps attempt it asks for fixes the shared Then step, and asks for a code attempt", function (this: RunWorld) {
  const next = { kind: "code" as const, reason: "The scenario's step definitions are right now: write the code" };
  this.script = [...this.script, { kind: "steps", scenario: FIRST, dir: attemptDir("steps"), next }, ...BUILD_SECOND];
});

Then("the output says the steps attempt's request was not followed", function (this: RunWorld) {
  const line = this.output.split("\n").find((text) => text.startsWith(`request for "${FIRST}": the steps attempt asks for a code attempt`));
  assert.ok(line !== undefined && /, not followed$/.test(line), `The output does not say the steps attempt's request was not followed:\n${this.output}`);
});
