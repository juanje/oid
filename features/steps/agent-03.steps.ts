import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { attemptDir, greet02AttemptDir, scenarioNames } from "../support/fixture.ts";
import { scriptedModel } from "../support/run.ts";
import type { RunWorld } from "../support/world.ts";

/** Each attempt's task, as its agent got it at its first request, with the attempt's kind and scenario. */
function tasksOf(world: RunWorld): { kind: string; scenario: string; task: string }[] {
  const model = scriptedModel(world);
  assert.equal(model.attempts.length, model.script.length, `Expected ${model.script.length} attempts, the model saw ${model.attempts.length}`);
  return model.attempts.map((requests, index) => ({ ...model.script[index]!, task: requests[0]!.task }));
}

/** The body of an FR in the project's SPEC.md, without its heading. */
function frBody(projectDir: string, fr: string): string {
  const spec = readFileSync(join(projectDir, "SPEC.md"), "utf8");
  const heading = spec.split("\n").findIndex((line) => line.startsWith(`#### ${fr}:`));
  assert.notEqual(heading, -1, `No ${fr} in the project's SPEC.md`);
  return spec.split("\n")[heading + 1]!.trim();
}

/** The text of a feature file's steps, without their keywords. */
function stepTexts(projectDir: string, featureFile: string): string[] {
  return readFileSync(join(projectDir, featureFile), "utf8")
    .split("\n")
    .map((line) => /^\s*(?:Given|When|Then|And|But)\s+(.+)$/.exec(line)?.[1])
    .filter((text) => text !== undefined);
}

Then("every attempt's task gives FR-GREET-01's text from SPEC.md and the steps of its scenario", function (this: RunWorld) {
  const body = frBody(this.projectDir, "FR-GREET-01");
  const steps = stepTexts(this.projectDir, "features/greet-01.feature");
  for (const { kind, task } of tasksOf(this)) {
    assert.ok(task.includes(body), `The ${kind} attempt's task does not give FR-GREET-01's text:\n${task}`);
    for (const step of steps) assert.ok(task.includes(step), `The ${kind} attempt's task does not give the step "${step}":\n${task}`);
  }
});

/** A step definition's source in a prepared attempt: the call that defines `pattern`, from its first line to its closing parenthesis. */
function definitionSource(file: string, pattern: string): string {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((line) => line.includes(`("${pattern}"`));
  assert.notEqual(start, -1, `No step definition for "${pattern}" in ${file}`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("});"));
  return [...lines.slice(start, end), "})"].join("\n");
}

Then("the test and code attempts' tasks give the scenario's failure and the source of the step definition it failed in", function (this: RunWorld) {
  // Before the code exists, the scenario fails in its When step: Node cannot find the module the step imports.
  const source = definitionSource(join(attemptDir("steps"), "features/steps/greet.steps.ts"), "I greet {string}");
  const later = tasksOf(this).filter(({ kind }) => kind === "test" || kind === "code");
  assert.equal(later.length, 2, "Expected one test and one code attempt");
  for (const { kind, task } of later) {
    assert.match(task, /Cannot find module[^\n]*src\/greet\.ts/, `The ${kind} attempt's task does not give the scenario's failure:\n${task}`);
    assert.ok(task.includes(source), `The ${kind} attempt's task does not give the source of the step definition it failed in:\n${task}`);
  }
});

const [GREET_02_FIRST, GREET_02_SECOND] = scenarioNames("greet-02/contract/features/greet-02.feature") as [string, string];

Given("the scripted model builds FR-GREET-02", function (this: RunWorld) {
  const build = (scenario: string, prefix: string) =>
    (["steps", "test", "code"] as const).map((kind) => ({ kind, scenario, dir: greet02AttemptDir(`${prefix}-${kind}`) }));
  scriptedModel(this).script = [...build(GREET_02_FIRST, "s1"), ...build(GREET_02_SECOND, "s2")];
});

/** The task of the attempt of `kind` for `scenario`. */
function taskOf(world: RunWorld, kind: string, scenario: string): string {
  const found = tasksOf(world).find((attempt) => attempt.kind === kind && attempt.scenario === scenario);
  assert.ok(found !== undefined, `No ${kind} attempt for "${scenario}"`);
  return found.task;
}

Then(
  "the code attempt for FR-GREET-02's second scenario was given the source its steps import and the unit tests that import that source",
  function (this: RunWorld) {
    const task = taskOf(this, "code", GREET_02_SECOND);
    // When it starts, src/greet-all.ts is as the first scenario's code left it, and two unit tests import it.
    const given = [
      ["src/greet-all.ts", "s1-code"],
      ["tests/greet-all.test.ts", "s1-test"],
      ["tests/greet-list.test.ts", "s2-test"],
    ];
    for (const [file, attempt] of given) {
      assert.ok(task.includes(file!), `The code attempt's task does not name ${file}:\n${task}`);
      assert.ok(task.includes(readFileSync(join(greet02AttemptDir(attempt!), file!), "utf8").trim()), `The code attempt's task does not give ${file}'s source:\n${task}`);
    }
  },
);

/** The patterns of the step definitions in a prepared attempt's files. */
function patternsIn(dir: string, file: string): string[] {
  return [...readFileSync(join(dir, file), "utf8").matchAll(/\b(?:Given|When|Then)\("([^"]+)"/g)].map((match) => match[1]!);
}

Then("each steps attempt was given the patterns of the step definitions the project had when it started", function (this: RunWorld) {
  // FR-GREET-01's steps are built; the second scenario's steps attempt also finds those of the first.
  const greet01 = patternsIn(attemptDir("steps"), "features/steps/greet.steps.ts");
  const expected = new Map([
    [GREET_02_FIRST, greet01],
    [GREET_02_SECOND, [...greet01, ...patternsIn(greet02AttemptDir("s1-steps"), "features/steps/greet-all.steps.ts")]],
  ]);
  for (const [scenario, patterns] of expected) {
    const task = taskOf(this, "steps", scenario);
    for (const pattern of patterns) assert.ok(task.includes(pattern), `The steps attempt for "${scenario}" was not given the pattern "${pattern}":\n${task}`);
  }
});
