import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type DataTable, Given, Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO, OID_ROOT, attemptDir, commitProjectConfig, filesUnder, git } from "../support/fixture.ts";
import { assertOutputNames, runBranch } from "../support/run.ts";
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

Given("the scripted code attempt also writes .oid\\/progress.json", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "code", GREET_01_SCENARIO, attemptDir("code-writes-oid-state"));
});

Then("the output names .oid\\/progress.json", function (this: RunWorld) {
  assertOutputNames(this, ".oid/progress.json");
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

Given("the project's .oid.json gives the unit tests the path tests\\/ and the step definitions the path tests\\/steps\\/", async function (this: RunWorld) {
  await commitProjectConfig(this.projectDir, (config) => (config.paths = { ...config.paths, tests: ["tests/"], steps: ["tests/steps/"] }), "chore: paths that overlap");
});

Then("the output names tests\\/ and tests\\/steps\\/", function (this: RunWorld) {
  assertOutputNames(this, '"tests/"');
  assertOutputNames(this, '"tests/steps/"');
});

// The prepared attempts of FR-GREET-01 that write where a project laid out as the Rule's table keeps its files.
const LAYOUT_ATTEMPTS = join(OID_ROOT, "fixtures/greet/layout");

/** The project's paths of each kind, from the Rule's table, as .oid.json names them. */
function layoutPaths(world: RunWorld): { spec: string; features: string; steps: string[]; tests: string[]; code: string[] } {
  assert.ok(world.layout !== undefined, "The project's layout was not set");
  return world.layout;
}

Given("the project's files are where its .oid.json places them:", async function (this: RunWorld, table: DataTable) {
  const rows = Object.fromEntries(table.hashes().map(({ kind, paths }) => [kind!, paths!.split(", ")]));
  const layout = { spec: rows.spec![0]!, features: rows.features![0]!, steps: rows.steps!, tests: rows.tests!, code: rows.code! };
  this.layout = layout;
  const dir = this.projectDir;
  await mkdir(join(dir, dirname(layout.spec)), { recursive: true });
  await rename(join(dir, "SPEC.md"), join(dir, layout.spec));
  await mkdir(join(dir, layout.features), { recursive: true });
  await rename(join(dir, "features/greet-01.feature"), join(dir, layout.features, "greet-01.feature"));
  // cucumber-js finds the feature files and the step definitions where the project's own configuration says.
  const imports = layout.steps.map((path) => `"${path}**/*.ts"`).join(", ");
  await writeFile(join(dir, "cucumber.mjs"), `export default {\n  paths: ["${layout.features}**/*.feature"],\n  import: [${imports}],\n};\n`);
  const tsconfig = JSON.parse(await readFile(join(dir, "tsconfig.json"), "utf8"));
  tsconfig.include = [...new Set([...layout.code, ...layout.tests, ...layout.steps].map((path) => `${path.split("/")[0]}/**/*.ts`))];
  await writeFile(join(dir, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`);
  git(dir, "add", "--all");
  git(dir, "commit", "-q", "-m", "chore: the project's own layout");
  await commitProjectConfig(dir, (config) => (config.paths = { ...config.paths, ...layout }), "chore: oid's paths for the project's layout");
});

Given("the scripted attempts write their files under those paths", function (this: RunWorld) {
  this.script = (["steps", "test", "code"] as const).map((kind) => ({ kind, scenario: GREET_01_SCENARIO, dir: join(LAYOUT_ATTEMPTS, "attempts", kind) }));
});

Then("the FR's commit has its step definitions under tests\\/steps\\/, its unit tests under tests\\/unit\\/, and its source under src\\/ and shared\\/", function (this: RunWorld) {
  const files = git(this.projectDir, "diff", "--name-only", this.startHead, runBranch(this)).split("\n");
  for (const path of ["tests/steps/", "tests/unit/", "src/", "shared/"]) {
    assert.ok(files.some((file) => file.startsWith(path)), `The FR's commit has nothing under ${path}: ${files.join(", ")}`);
  }
  const { steps, tests, code } = layoutPaths(this);
  const outside = files.filter((file) => ![...steps, ...tests, ...code].some((path) => file.startsWith(path)));
  assert.deepEqual(outside, [], `The FR's commit has files outside the project's paths`);
});

Then("every attempt's task gives FR-GREET-01's text from specs\\/SPEC.md", function (this: RunWorld) {
  const spec = readFileSync(join(this.projectDir, layoutPaths(this).spec), "utf8").split("\n");
  const body = spec[spec.findIndex((line) => line.startsWith("#### FR-GREET-01:")) + 1]!.trim();
  const told = this.executor?.told ?? [];
  assert.ok(told.length > 0, "No attempt was told anything");
  for (const { task } of told) assert.ok(task.includes(body), `A task does not give FR-GREET-01's text:\n${task}`);
});

Given("the scripted test attempt also writes a file under tests\\/steps\\/", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "test", GREET_01_SCENARIO, join(LAYOUT_ATTEMPTS, "attempts", "test-writes-steps"));
});

Then("the output names the file the test attempt wrote under tests\\/steps\\/", function (this: RunWorld) {
  assertOutputNames(this, "tests/steps/greeting.steps.ts");
});

Given("the scripted code attempt also writes shared\\/vitest.config.ts", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "code", GREET_01_SCENARIO, join(LAYOUT_ATTEMPTS, "attempts", "code-writes-vitest-config"));
});

Then("the output names shared\\/vitest.config.ts", function (this: RunWorld) {
  assertOutputNames(this, "shared/vitest.config.ts");
});

Given("the project's vitest configuration loads tests\\/support\\/setup.ts before the unit tests", async function (this: RunWorld) {
  await cp(join(LAYOUT_ATTEMPTS, "project"), this.projectDir, { recursive: true });
  git(this.projectDir, "add", "--all");
  git(this.projectDir, "commit", "-q", "-m", "chore: a setup file vitest loads before every unit test");
});

Given("the scripted steps attempt also changes tests\\/support\\/setup.ts", function (this: RunWorld) {
  this.script = lastAttempt(this.script, "steps", GREET_01_SCENARIO, join(LAYOUT_ATTEMPTS, "attempts", "steps-changes-setup"));
});

Then("the output names tests\\/support\\/setup.ts", function (this: RunWorld) {
  assertOutputNames(this, "tests/support/setup.ts");
});
