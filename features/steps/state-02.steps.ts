import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import { attemptDir } from "../support/fixture.ts";
import type { EndEvent, Measures } from "../../src/run-log.ts";
import { attemptsIn, runLog } from "../support/run.ts";
import type { Usage } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

async function measuresOf(world: RunWorld): Promise<Measures> {
  const end = (await runLog(world)).find((entry): entry is EndEvent => entry.event === "end");
  assert.ok(end !== undefined, "The run's log has no measures at its end");
  return end.measures;
}

/** What the executor reports for each prepared attempt, in order: distinct, so that each is told apart. */
const usageOf = (index: number): Usage => ({ model: `model-${index}`, tokens: 100 * (index + 1), cost: 0.01 * (index + 1), deniedToolCalls: index });

Given("the scripted code attempt is refused, and its retry fails the same way", function (this: RunWorld) {
  this.script = this.script.flatMap((attempt) =>
    attempt.kind === "code" ? [{ ...attempt, dir: attemptDir("code-refused-hi") }, { ...attempt, dir: attemptDir("code-refused-hi") }] : [attempt],
  );
});

Given("the scripted executor reports a model, tokens, cost, turns and denied tool calls for each attempt", function (this: RunWorld) {
  this.script = this.script.map((attempt, index) => ({ ...attempt, turns: index + 1, usage: usageOf(index) }));
});

Then("the run's log lists the attempts {}, in that order", async function (this: RunWorld, kinds: string) {
  const expected = kinds.split(/, | and /);
  assert.deepEqual(attemptsIn(await runLog(this)).map((entry) => entry.kind), expected);
});

Then("the log gives the first code attempt the verdict refused, with its refusal", async function (this: RunWorld) {
  const [first] = attemptsIn(await runLog(this)).filter((entry) => entry.kind === "code");
  assert.equal(first?.verdict, "refused");
  for (const part of ["failed", "evidence", "next"] as const) assert.notEqual(first.refusal?.[part] ?? "", "", `The refusal's ${part} is empty`);
});

Then("the log gives every other attempt the verdict accepted", async function (this: RunWorld) {
  const attempts = attemptsIn(await runLog(this));
  const firstCode = attempts.findIndex((entry) => entry.kind === "code");
  assert.deepEqual(
    attempts.filter((_, index) => index !== firstCode).map((entry) => entry.verdict),
    attempts.filter((_, index) => index !== firstCode).map(() => "accepted"),
  );
});

Then("the run's log counts {int} code attempts and {int} code rejections", async function (this: RunWorld, attempts: number, rejections: number) {
  const measures = await measuresOf(this);
  assert.deepEqual({ attempts: measures.attempts.code, rejections: measures.rejections.code }, { attempts, rejections });
});

Then("the run's log counts {int} blind retry", async function (this: RunWorld, blindRetries: number) {
  assert.equal((await measuresOf(this)).blindRetries, blindRetries);
});

Then("the run's log gives each attempt what the executor reported for it", async function (this: RunWorld) {
  const attempts = attemptsIn(await runLog(this));
  assert.equal(attempts.length, this.script.length);
  for (const [index, entry] of attempts.entries()) {
    const { model, tokens, cost, deniedToolCalls } = entry;
    assert.deepEqual({ model, tokens, cost, deniedToolCalls, turns: entry.turns }, { ...usageOf(index), turns: index + 1 });
  }
});

Then("the run's log totals the tokens, the cost and the denied tool calls of every attempt", async function (this: RunWorld) {
  const measures = await measuresOf(this);
  const reported = this.script.map((_, index) => usageOf(index));
  const sum = (part: "tokens" | "cost" | "deniedToolCalls") => reported.reduce((total, usage) => total + usage[part], 0);
  assert.equal(measures.tokens, sum("tokens"));
  assert.ok(Math.abs(measures.cost - sum("cost")) < 1e-9, `The total cost is ${measures.cost}, not ${sum("cost")}`);
  assert.equal(measures.deniedToolCalls, sum("deniedToolCalls"));
});

Then("the run's log gives the run's time, measured by oid", async function (this: RunWorld) {
  const { timeMs } = await measuresOf(this);
  assert.ok(typeof timeMs === "number" && timeMs > 0, `The run's time is ${timeMs}`);
});

Then("the run's log says the run stopped at the turn limit", async function (this: RunWorld) {
  const stop = (await runLog(this)).find((entry) => entry.event === "stop");
  assert.equal(stop?.limit, "turns", "The run's log does not say the run stopped at the turn limit");
});
