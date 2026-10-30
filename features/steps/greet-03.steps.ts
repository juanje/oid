import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { OID_ROOT, createGreetProjectWith, greet03AttemptDir, scenarioNames, testNames } from "../support/fixture.ts";
import { assertOutputNames, requestsOf } from "../support/run.ts";
import { lastAttempt, type PreparedAttempt, replacedAttempt } from "../support/scripted-executor.ts";
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

/** Asserts that a line of the output names `what` with every one of the fixed `words`. */
function assertLineWith(world: RunWorld, what: string, words: string[]): void {
  const line = world.output.split("\n").find((text) => text.includes(what) && words.every((word) => new RegExp(`\\b${word}\\b`).test(text)));
  assert.ok(line !== undefined, `No line of the output names "${what}" with ${words.join(", ")}:\n${world.output}`);
}

Then("the output gives the new test's failure the class undecided, provisional", function (this: RunWorld) {
  assertLineWith(this, NEW_TEST, ["undecided", "provisional"]);
});

Then("the output says the new test's Red is confirmed", function (this: RunWorld) {
  assertLineWith(this, NEW_TEST, ["confirmed"]);
});

Then("the output gives the scenario's failure the class undecided, provisional", function (this: RunWorld) {
  assertLineWith(this, `"${SCENARIO}"`, ["undecided", "provisional"]);
});

Then("the output says the scenario's Red is confirmed", function (this: RunWorld) {
  assertLineWith(this, `"${SCENARIO}"`, ["confirmed"]);
});

/** Asserts that the refusal the run stopped with names `what` as refuted. */
function assertRefusedAsRefuted(world: RunWorld, what: string): void {
  const refusal = world.output.slice(world.output.lastIndexOf("Refused: "));
  assert.ok(refusal.startsWith("Refused: ") && /\brefuted\b/.test(refusal.split("\n")[0]!), `The run did not stop with a refutation:\n${world.output}`);
  assert.ok(refusal.includes(what), `The refusal does not name "${what}":\n${refusal}`);
}

Then("the output names the test as refuted", function (this: RunWorld) {
  assertRefusedAsRefuted(this, NEW_TEST);
});

Then("the output names the scenario as refuted", function (this: RunWorld) {
  assertRefusedAsRefuted(this, SCENARIO);
});

Then("the test attempt after the code attempts was given the refusal, naming the test as refuted", function (this: RunWorld) {
  const refusal = requestsOf(this, "test", 2)[1]!.refusal;
  assert.ok(refusal !== undefined, "The test attempt after the code attempts came without a refusal");
  const text = `${refusal.failed}\n${refusal.evidence}`;
  assert.ok(text.includes(NEW_TEST) && /\brefuted\b/.test(text), `The refusal does not name "${NEW_TEST}" as refuted:\n${text}`);
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

/** The prepared attempt `name` of `kind` takes the place of the default one; the attempts after it stay. */
function replaceKeeping(world: RunWorld, kind: PreparedAttempt["kind"], name: string): void {
  world.script = replacedAttempt(world.script, kind, SCENARIO, greet03AttemptDir(name));
}

/** Steps, a test, a code attempt that leaves it failing, the test's repair, and the code again. */
function withRepair(test: string, repair: string): PreparedAttempt[] {
  return (["steps", test, "code", repair, "code"] as const).map((name): PreparedAttempt => ({
    kind: name === "steps" || name === "code" ? name : "test",
    scenario: SCENARIO,
    dir: greet03AttemptDir(name),
  }));
}

Given("the scripted test attempt fails with an error of its own while the function it asks for does not exist yet", function (this: RunWorld) {
  replaceKeeping(this, "test", "test-own-error");
});

Given("the scripted steps attempt fails with an error of its own while the function it asks for does not exist yet", function (this: RunWorld) {
  replaceKeeping(this, "steps", "steps-own-error");
});

Given("the scripted test attempt calls the existing greeting function in a way that fails as {string}, and its repair calls the new function", function (this: RunWorld, _message: string) {
  this.script = withRepair("test-wrong-call", "test");
});

Given("the scripted test attempt calls a function the assertion package does not have, and so does its repair", function (this: RunWorld) {
  this.script = withRepair("test-package-call", "test-package-call");
});

Given("the scripted steps attempt asserts with a function the assertion package does not have", function (this: RunWorld) {
  replaceKeeping(this, "steps", "steps-package-call");
});

Given("the scripted code attempt does not make its unit test pass", function (this: RunWorld) {
  replaceKeeping(this, "code", "code-wrong");
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

Given("the scripted test attempt writes its test under tests\\/unit\\/ and imports the source one directory short", function (this: RunWorld) {
  replaceAttempt(this, "test", "test-outside-source");
});

Then("the output names the resolved path, which is not under the source", function (this: RunWorld) {
  assertOutputNames(this, "tests/src/greet.ts");
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
