import assert from "node:assert/strict";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO, attemptDir, testNames } from "../support/fixture.ts";
import { lastAttempt, type PreparedAttempt, replacedAttempt, type Tried } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

const NEW_TEST_FILE = "tests/greet.test.ts";

/** The prepared attempt of `kind`, with `name`'s files and the tries it makes. */
function withTries(world: RunWorld, kind: PreparedAttempt["kind"], name: string, tries: PreparedAttempt["tries"], last: boolean): void {
  const script = (last ? lastAttempt : replacedAttempt)(world.script, kind, GREET_01_SCENARIO, attemptDir(name));
  world.script = script.map((attempt) => (attempt.kind === kind ? { ...attempt, tries } : attempt));
}

/** What the attempt of `kind` got from its one try. */
function triedBy(world: RunWorld, kind: PreparedAttempt["kind"]): Tried {
  const tried = world.executor?.tried.filter((call) => call.kind === kind) ?? [];
  assert.equal(tried.length, 1, `Expected the ${kind} attempt to try once, it tried ${tried.length} times`);
  return tried[0]!;
}

Given("the scripted test attempt tries its new test before it ends", function (this: RunWorld) {
  withTries(this, "test", "test", [{ test: NEW_TEST_FILE }], false);
});

Given("the scripted code attempt writes a type error and tries the scenario of FR-GREET-01 before it ends", function (this: RunWorld) {
  withTries(this, "code", "code-type-error", [{ scenario: true }], false);
});

Given("the scripted test attempt writes a test that passes without its code and tries it before it ends", function (this: RunWorld) {
  withTries(this, "test", "test-passes-without-code", [{ test: NEW_TEST_FILE }], true);
});

Then("the test attempt got a failure for its new test, with what failed, the evidence and the next step", function (this: RunWorld) {
  const { result } = triedBy(this, "test");
  assert.ok(!result.passed, "try passed the new test before its code exists");
  for (const part of ["failed", "evidence", "next"] as const) assert.notEqual(result[part].trim(), "", `The failure's ${part} is empty`);
  assert.ok(result.evidence.includes(NEW_TEST_FILE), `The evidence does not name ${NEW_TEST_FILE}:\n${result.evidence}`);
});

Then("the code attempt got a failure that names the type check and the file with the error", function (this: RunWorld) {
  const { result } = triedBy(this, "code");
  assert.ok(!result.passed, "try passed code with a type error");
  assert.match(`${result.failed}\n${result.evidence}`, /\btypes\b/i);
  assert.ok(result.evidence.includes("src/greet.ts"), `The evidence does not name src/greet.ts:\n${result.evidence}`);
});

Then("the test attempt got a pass for its new test", function (this: RunWorld) {
  const { result } = triedBy(this, "test");
  assert.ok(result.passed, `try did not pass the test:\n${JSON.stringify(result)}`);
  assert.ok(testNames(join(attemptDir("test-passes-without-code"), NEW_TEST_FILE)).length > 0);
});
