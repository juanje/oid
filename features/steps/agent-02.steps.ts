import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { WRITABLE } from "../../src/boundaries.ts";
import type { ScriptedModel } from "../support/scripted-model.ts";
import type { RunWorld } from "../support/world.ts";

/** Each attempt's kind, and oid's part of the system prompt its agent got at its first request. */
function promptsOf(world: RunWorld): { kind: string; prompt: string; tools: string[] }[] {
  const model: ScriptedModel | undefined = world.model;
  assert.ok(model !== undefined, "No scripted model");
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
