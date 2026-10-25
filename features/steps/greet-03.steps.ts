import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { OID_ROOT, createGreetProjectWith, git, greet03AttemptDir, scenarioNames, testNames } from "../support/fixture.ts";
import { assertOutputNames } from "../support/run.ts";
import { lastAttempt, type PreparedAttempt } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

const [SCENARIO] = scenarioNames("greet-03/contract/features/greet-03.feature") as [string];
const [NEW_TEST] = testNames(join(greet03AttemptDir("test"), "tests/greet-with.test.ts")) as [string];

Given("a project where FR-GREET-01 is built and FR-GREET-03 has an approved feature file", async function (this: RunWorld) {
  this.projectDir = await createGreetProjectWith("greet-03");
});

Given("a scripted executor that builds FR-GREET-03 with a new function in the module of FR-GREET-01", function (this: RunWorld) {
  this.script = (["steps", "test", "code"] as const).map((kind): PreparedAttempt => ({ kind, scenario: SCENARIO, dir: greet03AttemptDir(kind) }));
});

Then("the output gives the new test's failure the class {word}", function (this: RunWorld, failureClass: string) {
  const line = this.output.split("\n").find((text) => text.includes(NEW_TEST) && new RegExp(`\\b${failureClass}\\b`).test(text));
  assert.ok(line !== undefined, `No line of the output gives "${NEW_TEST}" the class ${failureClass}:\n${this.output}`);
});

Then("the output gives the scenario's failure the class {word}", function (this: RunWorld, failureClass: string) {
  const line = this.output.split("\n").find((text) => text.includes(`"${SCENARIO}"`) && new RegExp(`\\b${failureClass}\\b`).test(text));
  assert.ok(line !== undefined, `No line of the output gives the scenario "${SCENARIO}" the class ${failureClass}:\n${this.output}`);
});

Then("the output gives the failure the class {word}", function (this: RunWorld, failureClass: string) {
  assert.match(this.output, new RegExp(`\\b${failureClass}\\b`), `The output does not give the class ${failureClass}:\n${this.output}`);
});

/** The text of the fixture scenario's step that starts with `keyword`. */
function stepText(keyword: "Given" | "When" | "Then"): string {
  const line = readFileSync(join(OID_ROOT, "fixtures/greet/greet-03/contract/features/greet-03.feature"), "utf8")
    .split("\n")
    .find((text) => text.trim().startsWith(`${keyword} `));
  assert.ok(line !== undefined, `The fixture scenario has no ${keyword} step`);
  return line.trim().slice(keyword.length + 1);
}

/** The prepared attempt `name` of `kind` takes the place of the default one, and the run asks for nothing after it. */
function replaceAttempt(world: RunWorld, kind: PreparedAttempt["kind"], name: string): void {
  world.script = lastAttempt(world.script, kind, SCENARIO, greet03AttemptDir(name));
}

Given("the scripted test attempt calls the existing greeting function in a way that fails as {string}", function (this: RunWorld, _message: string) {
  replaceAttempt(this, "test", "test-wrong-call");
});

Given("the module of FR-GREET-01 also has a greeter class", async function (this: RunWorld) {
  await cp(join(OID_ROOT, "fixtures/greet/greet-03/greeter"), this.projectDir, { recursive: true });
  git(this.projectDir, "add", "--all");
  git(this.projectDir, "commit", "-q", "-m", "feat: a greeter class");
});

Given("the scripted executor builds FR-GREET-03 as a new method of the greeter class, its steps typing the World by shape", function (this: RunWorld) {
  this.script = (["steps", "test", "code"] as const).map((kind): PreparedAttempt => ({ kind, scenario: SCENARIO, dir: greet03AttemptDir(`greeter-${kind}`) }));
});

Given("the scripted test attempt calls a function the assertion package does not have", function (this: RunWorld) {
  replaceAttempt(this, "test", "test-package-call");
});

Given("the scripted steps attempt leaves the Then step of FR-GREET-03 undefined", function (this: RunWorld) {
  replaceAttempt(this, "steps", "steps-then-undefined");
});

Given("the scripted steps attempt writes a Given step that fails because the code does not exist yet", function (this: RunWorld) {
  replaceAttempt(this, "steps", "steps-given-fails");
});

Given("the scripted test attempt writes a test file with a syntax error", function (this: RunWorld) {
  replaceAttempt(this, "test", "test-syntax-error");
});

Given("the scripted test attempt writes a test that imports a package that is not installed", function (this: RunWorld) {
  replaceAttempt(this, "test", "test-missing-package");
});

Given("the scripted test attempt writes its test in a file vitest does not collect", function (this: RunWorld) {
  replaceAttempt(this, "test", "test-not-collected");
});

Given("the scripted test attempt writes a test that fails reading a file that does not exist", function (this: RunWorld) {
  replaceAttempt(this, "test", "test-enoent");
});

Then("the output names the test", function (this: RunWorld) {
  assertOutputNames(this, NEW_TEST);
});

Then("the output names the undefined step", function (this: RunWorld) {
  assertOutputNames(this, stepText("Then"));
});

Then("the output names the Given step that failed", function (this: RunWorld) {
  assertOutputNames(this, stepText("Given"));
});

Then("the output names the test file", function (this: RunWorld) {
  assertOutputNames(this, "tests/greet-with.test.ts");
});

Then("the output names the package", function (this: RunWorld) {
  assertOutputNames(this, "left-pad");
});

Then("the output names the file", function (this: RunWorld) {
  assertOutputNames(this, "tests/greet-with.ts");
});
