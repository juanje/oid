import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO, OID_ROOT, attemptDir, commitFixture, commitProjectConfig, git } from "../support/fixture.ts";
import { assertOutputNames, requestsOf, runBranch } from "../support/run.ts";
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

Given("the project's .oid.json gives the source the paths src\\/ and shared\\/", async function (this: RunWorld) {
  await commitProjectConfig(this.projectDir, (config) => (config.paths = { ...config.paths, code: ["src/", "shared/"] }), "chore: the source in src/ and shared/");
});

Given("the scripted code attempt also adds, under shared\\/, a branch no test takes, and its attempt after the gate removes it", function (this: RunWorld) {
  this.script = greet01("steps", "test", "code-shared-untaken-branch", "code-shared");
});

Then("the code attempt after the gate was given the uncovered branch, naming its file under shared\\/ and its line", function (this: RunWorld) {
  const refusal = requestsOf(this, "code", 2)[1]!.refusal;
  assert.ok(refusal !== undefined, "The code attempt after the gate came without the gate's refusal");
  assert.match(refusal.evidence, /shared\/salutation\.ts:3\b/, `The refusal does not name shared/salutation.ts and the branch's line, 3:\n${refusal.evidence}`);
});

/** Puts `attempt` right after the code attempt that built the FR: the attempt after the gate comes first. */
function afterFirstCode(script: RunWorld["script"], attempt: RunWorld["script"][number]): RunWorld["script"] {
  const at = script.findIndex((prepared) => prepared.kind === "code");
  return [...script.slice(0, at + 1), attempt, ...script.slice(at + 1)];
}

const NO_REQUIREMENT = "No requirement asks for the empty-name branch of greet: neither the SPEC nor the FR's scenarios say what an empty name gets.";

Given("the scripted test attempt after the gate adds no test and reports that no requirement asks for the branch", function (this: RunWorld) {
  // The test the FR's build committed, as it is: the attempt changes nothing.
  this.script = afterFirstCode(this.script, { kind: "test", scenario: GREET_01_SCENARIO, dir: attemptDir("test"), report: NO_REQUIREMENT });
});

Given("the scripted code attempt adds a branch on a line its test covers, which no test takes", function (this: RunWorld) {
  this.script = greet01("steps", "test", "code-untaken-branch");
});

Given("the scripted code attempt after the gate removes the branch", function (this: RunWorld) {
  this.script = [...this.script, { kind: "code", scenario: GREET_01_SCENARIO, dir: attemptDir("code") }];
});

Then("the code attempt after the gate was given the uncovered branch and the test attempt's report", function (this: RunWorld) {
  const refusal = requestsOf(this, "code", 2)[1]!.refusal;
  assert.ok(refusal !== undefined, "The code attempt after the gate came without the gate's refusal");
  assert.match(refusal.evidence, /src\/greet\.ts:3\b/, `The refusal does not name src/greet.ts and the branch's line, 3:\n${refusal.evidence}`);
  assert.ok(refusal.evidence.includes(NO_REQUIREMENT), `The refusal does not give the test attempt's report:\n${refusal.evidence}`);
});

Given("the scripted code attempt adds a branch the SPEC states, on a line its test covers, which no test takes", async function (this: RunWorld) {
  await commitFixture(this.projectDir, attemptDir("spec-stranger"), "spec: an empty name is greeted as a stranger");
  this.script = greet01("steps", "test", "code-untaken-branch");
});

Given(
  "the scripted test attempt after the gate adds a unit test that takes the branch, with a mutant of the branch on which it fails",
  function (this: RunWorld) {
    const mutant = {
      reason: "Without the branch, an empty name gets no stranger's greeting",
      files: [{ path: "src/greet.ts", edits: [{ oldText: '"Hello, stranger!"', newText: "`Hello, ${name}!`" }] }],
    };
    this.script = [...this.script, { kind: "test", scenario: GREET_01_SCENARIO, dir: attemptDir("test-greets-stranger"), mutant }];
  },
);

Then("the test attempt after the gate was given the uncovered branch, naming its file and line", function (this: RunWorld) {
  const refusal = requestsOf(this, "test", 2)[1]!.refusal;
  assert.ok(refusal !== undefined, "The test attempt after the gate came without the gate's refusal");
  assert.match(refusal.evidence, /src\/greet\.ts:3\b/, `The refusal does not name src/greet.ts and the branch's line, 3:\n${refusal.evidence}`);
});

Then("the executor was not asked for a code attempt after the gate", function (this: RunWorld) {
  requestsOf(this, "code", 1);
});

Then("the run's commit holds the new unit test and the branch", function (this: RunWorld) {
  const branch = runBranch(this);
  const files = git(this.projectDir, "ls-tree", "-r", "--name-only", branch).split("\n");
  assert.ok(files.includes("tests/greet-stranger.test.ts"), `The run's commit does not hold the new unit test:\n${files.join("\n")}`);
  assert.match(git(this.projectDir, "show", `${branch}:src/greet.ts`), /stranger/, "The run's commit does not hold the branch");
});
