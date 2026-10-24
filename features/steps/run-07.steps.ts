import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import { attemptDir, git } from "../support/fixture.ts";
import { assertOutputNames, requestsOf, runBranch } from "../support/run.ts";
import type { PreparedAttempt, Request } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

// The file only the refused code attempt writes, and what each refused attempt makes greet return.
const LEFTOVER = "src/leftover.ts";
const FIRST_REFUSED = "Hi, Ada!";
const RETRY_REFUSED = "Hey, Ada!";

/** The script with the code attempt answered first by `first`, then by `retry`. */
function codeTwice(script: PreparedAttempt[], first: string, retry: string): PreparedAttempt[] {
  return script.flatMap((attempt) =>
    attempt.kind === "code" ? [{ ...attempt, dir: attemptDir(first) }, { ...attempt, dir: attemptDir(retry) }] : [attempt],
  );
}

/** The executor's requests for code attempts: the first one, then its retry. */
function codeRequests(world: RunWorld): [Request, Request] {
  return requestsOf(world, "code", 2) as [Request, Request];
}

Given("the scripted code attempt is first refused, after writing a file that its retry does not write", function (this: RunWorld) {
  this.script = codeTwice(this.script, "code-refused-hi", "code");
});

Given("the scripted code attempt is refused, and so is its retry", function (this: RunWorld) {
  this.script = codeTwice(this.script, "code-refused-hi", "code-refused-hey");
});

Then("the retried code attempt was given the refusal of the attempt before it", function (this: RunWorld) {
  const [first, retry] = codeRequests(this);
  assert.equal(first.refusal, undefined, "The first code attempt came with a refusal");
  assert.ok(retry.refusal !== undefined, "The retry came without the refusal");
  assert.ok(retry.refusal.evidence.includes(FIRST_REFUSED), `The retry's refusal is not the first attempt's:\n${JSON.stringify(retry.refusal)}`);
});

Then("the retried code attempt started from a tree without the file the refused attempt wrote", function (this: RunWorld) {
  const [, retry] = codeRequests(this);
  assert.ok(!retry.files.includes(LEFTOVER), `The retry found ${LEFTOVER} in its worktree`);
});

Then("the run's commit does not hold the file only the refused attempt wrote", function (this: RunWorld) {
  const files = git(this.projectDir, "ls-tree", "-r", "--name-only", runBranch(this)).split("\n");
  assert.ok(!files.includes(LEFTOVER), `The run's commit holds ${LEFTOVER}`);
});

Then("the output gives the refusal of the retry", function (this: RunWorld) {
  assertOutputNames(this, RETRY_REFUSED);
});
