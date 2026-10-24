import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Then } from "@cucumber/cucumber";
import { attemptDir } from "../support/fixture.ts";
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

/** A step definition's source in a prepared attempt: the lines from the call that defines `pattern` to its end. */
function definitionSource(file: string, pattern: string): string {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((line) => line.includes(`("${pattern}"`));
  assert.notEqual(start, -1, `No step definition for "${pattern}" in ${file}`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("});"));
  return lines.slice(start, end + 1).join("\n");
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
