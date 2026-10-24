import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { git, greet02AttemptDir, scenarioNames } from "../support/fixture.ts";
import { assertOutputNames, runBranch } from "../support/run.ts";
import { lastAttempt } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

const [FIRST, SECOND] = scenarioNames("greet-02/contract/features/greet-02.feature") as [string, string];
const RED_CLASSES = /\b(business_assertion|missing_implementation)\b/;

/** The summary's line about `scenario`. The summary marks each scenario with the fixed words "built" or "not built". */
function summaryLine(world: RunWorld, scenario: string): string {
  const line = world.output.split("\n").find((text) => text.includes(`"${scenario}"`) && /\bbuilt\b/.test(text));
  assert.ok(line !== undefined, `The summary has no line for "${scenario}":\n${world.output}`);
  return line;
}

const isBuilt = (line: string): boolean => /\bbuilt\b/.test(line) && !/\bnot built\b/.test(line);

Given("the scripted steps attempt for the second scenario writes step definitions that pass without code", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "steps", SECOND, greet02AttemptDir("s2-steps-pass"));
});

Then("the run's summary marks both scenarios of FR-GREET-02 built, each with the classes of its Reds", function (this: RunWorld) {
  for (const scenario of [FIRST, SECOND]) {
    const line = summaryLine(this, scenario);
    assert.ok(isBuilt(line), `"${scenario}" is not marked built: ${line}`);
    assert.match(line, RED_CLASSES, `The summary gives "${scenario}" no class of its Reds: ${line}`);
  }
});

Then("the run's summary names the run's branch", function (this: RunWorld) {
  assertOutputNames(this, runBranch(this));
});

Then("the run's summary gives the run's attempts, rejections and time", function (this: RunWorld) {
  for (const measure of [/\battempts\b/i, /\brejections\b/i, /\btime\b/i]) assert.match(this.output, measure, `The summary does not give the run's ${measure.source}`);
});

Then("the run's summary names the run's log file", async function (this: RunWorld) {
  const [log] = await readdir(join(this.projectDir, ".git/oid/runs"));
  assert.ok(log !== undefined, "The run wrote no log");
  assertOutputNames(this, join(".git/oid/runs", log));
});

Then("the run's summary marks the first scenario of FR-GREET-02 built and the second not built", function (this: RunWorld) {
  assert.ok(isBuilt(summaryLine(this, FIRST)), `"${FIRST}" is not marked built`);
  assert.match(summaryLine(this, SECOND), /\bnot built\b/, `"${SECOND}" is not marked not built`);
});

Then("the run's summary says the run stopped at the steps attempt for the second scenario, on a refusal", function (this: RunWorld) {
  const line = this.output.split("\n").find((text) => /\bstopped\b/i.test(text));
  assert.ok(line !== undefined, `The summary does not say where the run stopped:\n${this.output}`);
  for (const part of ["steps attempt", SECOND, "refus"]) assert.ok(line.includes(part), `The line where the run stopped does not name ${part}: ${line}`);
});

Then("the run's summary names the ref that keeps the run's checkpoints", function (this: RunWorld) {
  const [ref] = git(this.projectDir, "for-each-ref", "--format=%(refname)", "refs/oid/checkpoints/").split("\n").filter(Boolean);
  assert.ok(ref !== undefined, "The run kept no checkpoint ref");
  assertOutputNames(this, ref);
});
