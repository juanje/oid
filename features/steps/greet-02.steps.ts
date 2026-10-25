import assert from "node:assert/strict";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { attemptDir, createGreetProjectWith, greet02AttemptDir, scenarioNames, testNames } from "../support/fixture.ts";
import { assertOutputNames, requestsOf } from "../support/run.ts";
import { lastAttempt, type PreparedAttempt, replacedAttempt } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

const [FIRST, SECOND] = scenarioNames("greet-02/contract/features/greet-02.feature") as [string, string];

/** The attempts for one scenario of FR-GREET-02, by the names of their prepared directories. */
function attempts(scenario: string, ...prepared: [PreparedAttempt["kind"], string][]): PreparedAttempt[] {
  return prepared.map(([kind, name]) => ({ kind, scenario, dir: greet02AttemptDir(name) }));
}

const BUILD_FIRST = attempts(FIRST, ["steps", "s1-steps"], ["test", "s1-test"], ["code", "s1-code"]);
const BUILD_SECOND = attempts(SECOND, ["steps", "s2-steps"], ["test", "s2-test"], ["code", "s2-code"]);

Given("a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios", async function (this: RunWorld) {
  this.projectDir = await createGreetProjectWith("greet-02");
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
  assertOutputNames(this, FIRST);
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
  assertOutputNames(this, testNames(join(greet02AttemptDir("s1-test"), "tests/greet-all.test.ts"))[0]);
});

/** The second scenario's first round: a helper and its test, with code that also breaks something that was green. */
function secondScenarioBreaking(code: string): PreparedAttempt[] {
  return attempts(SECOND, ["steps", "s2-steps"], ["test", "s2-test-names"], ["code", code]);
}

Given("the scripted code attempt for the second scenario breaks the unit test of FR-GREET-01", function (this: RunWorld) {
  this.script = [...BUILD_FIRST, ...secondScenarioBreaking("s2-code-names-breaks-greet")];
});

Then("the output names the unit test that turned red", function (this: RunWorld) {
  assertOutputNames(this, testNames(join(attemptDir("test"), "tests/greet.test.ts"))[0]);
});

Given("the scripted code attempt for the second scenario breaks the first scenario of FR-GREET-02, and no unit test", function (this: RunWorld) {
  this.script = [...BUILD_FIRST, ...secondScenarioBreaking("s2-code-names-breaks-pair")];
});

Then("the output names the scenario that turned red", function (this: RunWorld) {
  assertOutputNames(this, FIRST);
});

const FIRST_TEST_FILE = join(greet02AttemptDir("s1-test"), "tests/greet-all.test.ts");

Given("the scripted test attempt for the second scenario adds its test to the first scenario's test file", function (this: RunWorld) {
  this.script = replacedAttempt(this.script, "test", SECOND, greet02AttemptDir("s2-test-same-file"));
});

Given(
  "the scripted test attempt for the second scenario adds a test that passes without its code to the first scenario's test file",
  function (this: RunWorld) {
    this.script = lastAttempt(this.script, "test", SECOND, greet02AttemptDir("s2-test-same-file-passes"));
  },
);

Then("the output names the new test that passed without its code", function (this: RunWorld) {
  const added = testNames(join(greet02AttemptDir("s2-test-same-file-passes"), "tests/greet-all.test.ts")).filter(
    (name) => !testNames(FIRST_TEST_FILE).includes(name),
  );
  assert.equal(added.length, 1, "The prepared attempt should add exactly one test");
  assertOutputNames(this, added[0]);
});

Then("the output does not name the tests that were already in the file", function (this: RunWorld) {
  for (const name of testNames(FIRST_TEST_FILE)) {
    assert.ok(!this.output.includes(name), `The output names "${name}", which was already in the file:\n${this.output}`);
  }
});

const NODE_TEST_FILE = "tests/greet-all.test.ts";

Given("the scripted test attempt for the first scenario writes its test with node:test, and its retry with vitest", function (this: RunWorld) {
  // The node:test file fails on its missing import, a valid Red; once the code exists, vitest finds no test in it.
  this.script = [
    ...attempts(FIRST, ["steps", "s1-steps"], ["test", "s1-test-node-test"], ["code", "s1-code"], ["test", "s1-test"], ["code", "s1-code"]),
    ...BUILD_SECOND,
  ];
});

Then("the retried test attempt was told its test file defines no vitest test, naming the file", function (this: RunWorld) {
  const refusal = requestsOf(this, "test", 3)[1]!.refusal;
  assert.ok(refusal !== undefined, "The second test attempt came without a refusal");
  assert.ok(`${refusal.failed}\n${refusal.evidence}`.includes(NODE_TEST_FILE), `The refusal does not name ${NODE_TEST_FILE}:\n${JSON.stringify(refusal)}`);
  assert.match(refusal.next, /\bvitest\b/, `The refusal's next step does not point to vitest:\n${refusal.next}`);
});

Then("no code attempt was asked to fix that test file", function (this: RunWorld) {
  for (const request of requestsOf(this, "code", 3)) {
    const refusal = request.refusal;
    assert.ok(refusal === undefined || !`${refusal.failed}\n${refusal.evidence}`.includes(NODE_TEST_FILE), `A code attempt was asked to fix ${NODE_TEST_FILE}:\n${JSON.stringify(refusal)}`);
  }
});

Given("the first round for the first scenario of FR-GREET-02 builds a helper only, and its second round adds no test and code that connects the helper", function (this: RunWorld) {
  // Writing the first round's test again, as it is, adds no test; the code then connects the helper (docs/design.md §2, Wiring).
  const wiring = attempts(
    FIRST,
    ["steps", "s1-steps"],
    ["test", "s1-test-names"],
    ["code", "s1-code-names"],
    ["test", "s1-test-names"],
    ["code", "s1-code-uses-names"],
  );
  this.script = [...wiring, ...BUILD_SECOND];
});

Then("the output says the first round made no progress, naming the step where the scenario still failed", function (this: RunWorld) {
  const rounds = this.output.split("\n").filter((line) => line.startsWith(`round for "${FIRST}": `));
  assert.equal(rounds.length, 1, `Expected one round of "${FIRST}" with no progress:\n${this.output}`);
  assert.match(rounds[0]!, /\bno progress\b/);
  assert.ok(rounds[0]!.includes('I greet "Ada" and "Grace"'), `The round's line does not name the step where the scenario still failed:\n${rounds[0]}`);
});

Then("the summary counts one round with no progress", function (this: RunWorld) {
  assert.match(this.output, /\brounds with no progress 1\b/, `The summary does not count one round with no progress:\n${this.output}`);
});
