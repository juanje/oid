import assert from "node:assert/strict";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { createGreetProjectWith, greet03AttemptDir, scenarioNames, testNames } from "../support/fixture.ts";
import type { PreparedAttempt } from "../support/scripted-executor.ts";
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

Then("the output gives the failure the class {word}", function (this: RunWorld, failureClass: string) {
  assert.match(this.output, new RegExp(`\\b${failureClass}\\b`), `The output does not give the class ${failureClass}:\n${this.output}`);
});
