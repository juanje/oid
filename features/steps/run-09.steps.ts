import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO, attemptDir, greet02AttemptDir } from "../support/fixture.ts";
import { assertOutputNames, requestsOf } from "../support/run.ts";
import type { RunWorld } from "../support/world.ts";

/** The code attempt's agent would take `turns` turns to finish. */
function codeTakes(world: RunWorld, turns: number): void {
  world.script = world.script.map((attempt) => (attempt.kind === "code" ? { ...attempt, turns } : attempt));
}

Given("the scripted code attempt would take {int} turns", function (this: RunWorld, turns: number) {
  codeTakes(this, turns);
});

Given("the scripted code attempt takes {int} turns", function (this: RunWorld, turns: number) {
  codeTakes(this, turns);
});

Then("the run stops at a limit, not a refusal, an error or a crash", function (this: RunWorld) {
  // In-process, a crash is a thrown error; a limit is a returned exit code of 3 (docs/design.md §7).
  assert.equal(this.crash, undefined, `The run crashed:\n${String(this.crash)}`);
  assert.equal(this.exitCode, 3, `The run did not stop at a limit. Output:\n${this.output}`);
});

Then("the code attempt was stopped after its third turn", function (this: RunWorld) {
  const [code] = requestsOf(this, "code", 1);
  assert.deepEqual({ turns: code!.turns, stoppedAtLimit: code!.stoppedAtLimit }, { turns: 3, stoppedAtLimit: true });
});

Then("the code attempt was not retried", function (this: RunWorld) {
  requestsOf(this, "code", 1);
});

Then("the output names the turn limit and the code attempt", function (this: RunWorld) {
  assert.match(this.output, /\bturns?\b/i, `The output does not name the turn limit:\n${this.output}`);
  assertOutputNames(this, "code attempt");
  assertOutputNames(this, GREET_01_SCENARIO);
});

Given("the scripted steps attempt fails its Then step with a message that changes on every run", function (this: RunWorld) {
  this.script = this.script.map((attempt) => (attempt.kind === "steps" ? { ...attempt, dir: attemptDir("steps-moving-failure"), report: "Wrote the steps of greeting a person" } : attempt));
});

Given("the scripted attempts build a second round for the scenario, a test and its code", function (this: RunWorld) {
  this.script = [
    ...this.script,
    { kind: "test", scenario: GREET_01_SCENARIO, dir: greet02AttemptDir("s1-test-names"), report: "Tested listing two names" },
    { kind: "code", scenario: GREET_01_SCENARIO, dir: greet02AttemptDir("s1-code-names"), report: "listNames joins two names with and" },
  ];
});

Then("the output names the round limit, the scenario and its last failure", function (this: RunWorld) {
  assert.match(this.output, /\brounds?\b/i, `The output does not name the round limit:\n${this.output}`);
  assertOutputNames(this, GREET_01_SCENARIO);
  assertOutputNames(this, 'I get "Hello, Ada!"');
  assertOutputNames(this, "No greeting yet");
});
