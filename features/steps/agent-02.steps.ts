import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { WRITABLE } from "../../src/boundaries.ts";
import { scriptedModel } from "../support/run.ts";
import type { RunWorld } from "../support/world.ts";

/** Each attempt's kind, and oid's part of the system prompt its agent got at its first request. */
function promptsOf(world: RunWorld): { kind: string; prompt: string; tools: string[] }[] {
  const model = scriptedModel(world);
  assert.equal(model.attempts.length, model.script.length, `Expected ${model.script.length} attempts, the model saw ${model.attempts.length}`);
  return model.attempts.map((requests, index) => ({ kind: model.script[index]!.kind, prompt: requests[0]!.oidPrompt, tools: requests[0]!.tools }));
}

/** A prompt's parts: its paragraphs. */
const partsOf = (prompt: string) => prompt.split(/\n\s*\n/).map((part) => part.trim()).filter((part) => part !== "");

Then("each attempt's system prompt names every path its kind may write", function (this: RunWorld) {
  for (const { kind, prompt } of promptsOf(this)) {
    for (const path of WRITABLE[kind as keyof typeof WRITABLE]) assert.ok(prompt.includes(path), `The ${kind} attempt's system prompt does not name ${path}`);
  }
});

Then("each attempt's system prompt names every tool its agent was offered", function (this: RunWorld) {
  for (const { kind, prompt, tools } of promptsOf(this)) {
    assert.ok(tools.length > 0, `The ${kind} attempt's agent was offered no tool`);
    for (const tool of tools) assert.match(prompt, new RegExp(`\\b${tool}\\b`), `The ${kind} attempt's system prompt does not name the tool ${tool}`);
  }
});

Then("the steps, test and code attempts each had a system prompt with parts the others lack", function (this: RunWorld) {
  const prompts = promptsOf(this);
  assert.deepEqual(prompts.map(({ kind }) => kind).sort(), ["code", "steps", "test"]);
  for (const { kind, prompt } of prompts) {
    const others = prompts.filter((other) => other.kind !== kind).flatMap((other) => partsOf(other.prompt));
    assert.ok(partsOf(prompt).some((part) => !others.includes(part)), `The ${kind} attempt's system prompt has no part of its own`);
  }
});

Then("their system prompts share a part, word for word", function (this: RunWorld) {
  const [first, ...rest] = promptsOf(this).map(({ prompt }) => partsOf(prompt));
  const shared = (first ?? []).filter((part) => rest.every((parts) => parts.includes(part)));
  assert.ok(shared.length > 0, "The system prompts share no part");
});

/** oid's part of the system prompt of the attempt of `kind`. */
function promptOf(world: RunWorld, kind: string): string {
  const found = promptsOf(world).find((attempt) => attempt.kind === kind);
  assert.ok(found !== undefined, `No ${kind} attempt`);
  return found.prompt;
}

Then("the test attempt's system prompt names vitest and what a unit test imports from it", function (this: RunWorld) {
  const prompt = promptOf(this, "test");
  for (const name of ["vitest", "describe", "test", "expect"]) assert.match(prompt, new RegExp(`\\b${name}\\b`), `The test attempt's system prompt does not name ${name}`);
});

Then("the steps attempt's system prompt names cucumber-js and what a step definition imports from it", function (this: RunWorld) {
  const prompt = promptOf(this, "steps");
  for (const name of ["cucumber-js", "@cucumber/cucumber", "Given", "When", "Then"]) assert.ok(prompt.includes(name), `The steps attempt's system prompt does not name ${name}`);
});
