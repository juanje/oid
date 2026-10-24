import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO } from "../support/fixture.ts";
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
