import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { git } from "../support/fixture.ts";
import { assertOutputNames } from "../support/run.ts";
import type { RunWorld } from "../support/world.ts";

const UNKNOWN_COMPILER_OPTION = "noSuchCompilerOption";

/** Changes the project's own configuration and commits it, as the person's repository would have it. */
async function commitConfig(world: RunWorld, file: string, content: string): Promise<void> {
  await writeFile(join(world.projectDir, file), content);
  git(world.projectDir, "add", file);
  git(world.projectDir, "commit", "-q", "-m", `chore: ${file}`);
}

Given("the project's cucumber-js configuration looks for feature files where there are none", async function (this: RunWorld) {
  await commitConfig(this, "cucumber.mjs", 'export default {\n  paths: ["specs/**/*.feature"],\n  import: ["features/steps/**/*.ts"],\n};\n');
});

Given("the project's TypeScript configuration has an option its tsc does not know", async function (this: RunWorld) {
  const tsconfig = JSON.parse(await readFile(join(this.projectDir, "tsconfig.json"), "utf8"));
  tsconfig.compilerOptions[UNKNOWN_COMPILER_OPTION] = true;
  await commitConfig(this, "tsconfig.json", `${JSON.stringify(tsconfig, null, 2)}\n`);
});

Then("the output names FR-GREET-01", function (this: RunWorld) {
  assertOutputNames(this, "FR-GREET-01");
});

Then("the output names the type check and the option it does not know", function (this: RunWorld) {
  assert.match(this.output, /\btypes\b/i, `The output does not name the type check:\n${this.output}`);
  assertOutputNames(this, UNKNOWN_COMPILER_OPTION);
});
