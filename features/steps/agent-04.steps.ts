import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO, attemptDir, filesUnder } from "../support/fixture.ts";
import { assertOutputNames } from "../support/run.ts";
import { lastAttempt } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

// The prepared attempt that adds each pattern of the outline's examples.
const PATTERN_ATTEMPTS: Record<string, string> = {
  ".only": "test-only",
  ".skip": "test-skip",
  "process.env.VITEST": "code-vitest-env",
};

Given("the scripted test attempt also writes the source its test needs", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "test", GREET_01_SCENARIO, attemptDir("test-writes-source"));
});

Given("the scripted steps attempt also rewrites the feature file of FR-GREET-01", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "steps", GREET_01_SCENARIO, attemptDir("steps-rewrites-feature"));
});

Given("the scripted code attempt also changes the project's package.json", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "code", GREET_01_SCENARIO, attemptDir("code-changes-package"));
});

Given("the scripted {word} attempt adds a line with {}", function (this: RunWorld, kind: string, pattern: string) {
  assert.ok(kind === "test" || kind === "code", `No prepared ${kind} attempt adds a pattern`);
  const prepared = PATTERN_ATTEMPTS[pattern];
  assert.ok(prepared !== undefined, `No prepared attempt adds ${pattern}`);
  this.script = lastAttempt(this.script, kind, GREET_01_SCENARIO, attemptDir(prepared));
});

Then("the output names the source file the test attempt wrote", function (this: RunWorld) {
  assertOutputNames(this, "src/greet.ts");
});

Then("the output names the feature file", function (this: RunWorld) {
  assertOutputNames(this, "features/greet-01.feature");
});

Then("the output names package.json", function (this: RunWorld) {
  assertOutputNames(this, "package.json");
});

Then("the output names {} and the file that has it", async function (this: RunWorld, pattern: string) {
  assertOutputNames(this, pattern);
  const [file] = await filesUnder(attemptDir(PATTERN_ATTEMPTS[pattern]!));
  assertOutputNames(this, file);
});
