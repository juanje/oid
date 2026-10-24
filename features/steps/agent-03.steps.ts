import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Then } from "@cucumber/cucumber";
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
