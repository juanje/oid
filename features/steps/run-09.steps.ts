import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO, attemptDir, commitProjectConfig, greet02AttemptDir } from "../support/fixture.ts";
import { assertOutputNames, attemptOf, requestsOf, runLog } from "../support/run.ts";
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

Given("the project's .oid.json sets the check time limit to {int} seconds", async function (this: RunWorld, seconds: number) {
  await commitProjectConfig(this.projectDir, (config) => (config.limits = { ...config.limits, checkSeconds: seconds }), "chore: oid config");
});

Given("the scripted code attempt writes a greeting function that never returns, and its retry builds it", function (this: RunWorld) {
  const code = attemptOf(this.script, "code");
  this.script = [...this.script.filter((attempt) => attempt !== code), { ...code, dir: attemptDir("code-never-returns") }, code];
});

Then("the code attempt's retry was given a refusal that says the unit tests did not finish within {int} seconds", function (this: RunWorld, seconds: number) {
  const [, retry] = requestsOf(this, "code", 2);
  const refusal = JSON.stringify(retry!.refusal ?? {});
  assert.match(refusal, new RegExp(`did not finish within ${seconds} s`), `The retry's refusal does not say a check did not finish within ${seconds} s: ${refusal}`);
  assert.match(refusal, /unit/i, `The retry's refusal does not name the unit tests: ${refusal}`);
});

Then("the run's log counts one check stopped by the time limit", async function (this: RunWorld) {
  const end = (await runLog(this)).find((event) => event.event === "end");
  assert.ok(end?.event === "end", "The run's log has no measures");
  const stopped = Object.values(end.measures.stoppedChecks ?? {}).reduce((sum, count) => sum + count, 0);
  assert.equal(stopped, 1, `The run's measures do not count one check stopped: ${JSON.stringify(end.measures.stoppedChecks)}`);
});

Then("the output names the round limit, the scenario and its last failure", function (this: RunWorld) {
  assert.match(this.output, /\brounds?\b/i, `The output does not name the round limit:\n${this.output}`);
  assertOutputNames(this, GREET_01_SCENARIO);
  assertOutputNames(this, 'I get "Hello, Ada!"');
  assertOutputNames(this, "No greeting yet");
});
