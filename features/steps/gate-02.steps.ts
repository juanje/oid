import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO, OID_ROOT, attemptDir, git } from "../support/fixture.ts";
import { assertOutputNames, requestsOf } from "../support/run.ts";
import type { RunWorld } from "../support/world.ts";

/** FR-GREET-01's attempts, by the names of their prepared directories. */
function greet01(...names: [string, string, string, ...string[]]) {
  const kinds = ["steps", "test", "code", "code"] as const;
  return names.map((name, index) => ({ kind: kinds[index]!, scenario: GREET_01_SCENARIO, dir: attemptDir(name) }));
}

Given(
  "the scripted code attempt adds a branch on a line its test covers, which no test takes, and its attempt after the gate removes it",
  function (this: RunWorld) {
    this.script = greet01("steps", "test", "code-untaken-branch", "code");
  },
);

Given("the scripted code attempt adds a branch that only a scenario of the FR takes", function (this: RunWorld) {
  this.script = greet01("steps", "test-greets-grace", "code-ada-branch");
});

Given("the project already has a branch that no test takes", async function (this: RunWorld) {
  await mkdir(join(this.projectDir, "src"), { recursive: true });
  await writeFile(join(this.projectDir, "src/legacy.ts"), 'export function legacy(flag: boolean): string {\n  return flag ? "on" : "off";\n}\n');
  git(this.projectDir, "add", "src/legacy.ts");
  git(this.projectDir, "commit", "-q", "-m", "feat: code from before the FR, which no test runs");
});

Given("the project does not have @vitest\\/coverage-v8", async function (this: RunWorld) {
  // The fixture links oid's @vitest scope whole; it gets its own, with every package but the coverage provider.
  const scope = join(this.projectDir, "node_modules/@vitest");
  await rm(scope, { recursive: true, force: true });
  await mkdir(scope);
  for (const name of readdirSync(join(OID_ROOT, "node_modules/@vitest"))) {
    if (name !== "coverage-v8") await symlink(join(OID_ROOT, "node_modules/@vitest", name), join(scope, name));
  }
});

Then("the code attempt after the gate was given the uncovered branch, naming its file and line", function (this: RunWorld) {
  const refusal = requestsOf(this, "code", 2)[1]!.refusal;
  assert.ok(refusal !== undefined, "The code attempt after the gate came without the gate's refusal");
  assert.match(refusal.evidence, /src\/greet\.ts:3\b/, `The refusal does not name src/greet.ts and the branch's line, 3:\n${refusal.evidence}`);
});

Then("the output names @vitest\\/coverage-v8", function (this: RunWorld) {
  assertOutputNames(this, "@vitest/coverage-v8");
});

Given("the scripted steps attempt writes a step definition with a branch no run takes", function (this: RunWorld) {
  this.script = greet01("steps-untaken-branch", "test", "code");
});
