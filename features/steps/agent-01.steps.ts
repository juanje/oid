import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO, attemptDir } from "../support/fixture.ts";
import { attemptsIn, runLog } from "../support/run.ts";
import { ScriptedModel } from "../support/scripted-model.ts";
import type { RunWorld } from "../support/world.ts";

// Pi's own retries of a provider error, kept short so that a scenario does not wait seconds between them.
const QUICK_RETRIES = { maxRetries: 2, baseDelayMs: 1 };

/** Where Pi 1.4.0 finds rg and fd without downloading them: its agent dir's bin, then the PATH (DOMAIN.md, Pi SDK). */
function installedForPi(tool: "rg" | "fd"): boolean {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  if (existsSync(join(agentDir, "bin", tool))) return true;
  const names = tool === "fd" ? ["fd", "fdfind"] : ["rg"];
  return names.some((name) => spawnSync(name, ["--version"], { stdio: "ignore" }).error === undefined);
}

Given("rg and fd are installed where Pi finds them, since oid runs Pi offline", function () {
  const missing = (["rg", "fd"] as const).filter((tool) => !installedForPi(tool));
  assert.deepEqual(missing, [], `Pi cannot find ${missing.join(" and ")}: install them on the PATH, or in Pi's agent dir's bin`);
});

Given("oid runs its attempts with the Pi executor on a scripted model", async function (this: RunWorld) {
  const model = await ScriptedModel.create();
  this.model = model;
  this.piExecutor = async () => {
    // A dynamic import, so that a missing executor fails the step and not the whole load.
    const { piExecutor } = await import("../../src/pi-executor.ts");
    return piExecutor({ runtime: model.runtime, model: model.model, retry: QUICK_RETRIES });
  };
});

Given("the scripted model builds FR-GREET-01, writing each attempt's files and ending with a report", function (this: RunWorld) {
  scriptedModel(this).script = (["steps", "test", "code"] as const).map((kind) => ({ kind, scenario: GREET_01_SCENARIO, dir: attemptDir(kind) }));
});

function scriptedModel(world: RunWorld): ScriptedModel {
  assert.ok(world.model !== undefined, "No scripted model");
  return world.model;
}

Then(
  "the model saw, at each attempt, a system prompt and a task naming the attempt's kind and scenario, and nothing of the attempts before it",
  function (this: RunWorld) {
    const model = scriptedModel(this);
    assert.equal(model.attempts.length, model.script.length, `Expected ${model.script.length} attempts, the model saw ${model.attempts.length}`);
    assert.deepEqual(model.mismatches, [], "A task did not name its attempt's kind and scenario");
    const prompts = model.attempts.map((requests, index) => {
      const first = requests[0]!;
      assert.deepEqual(first.roles, ["system", "user"], `Attempt ${index + 1} began with more than its system prompt and its task`);
      assert.match(first.systemPrompt, new RegExp(`\\b${model.script[index]!.kind}\\b`), `Attempt ${index + 1}'s system prompt does not name its kind`);
      return first.systemPrompt;
    });
    // Pi's own prompt would be the same for every kind: oid gives each kind its own.
    assert.equal(new Set(prompts).size, prompts.length, "Attempts of different kinds got the same system prompt");
  },
);

Then("the model was offered the tools {}, and no shell", function (this: RunWorld, list: string) {
  const offered = list.split(/, | and /).sort();
  const model = scriptedModel(this);
  assert.ok(model.attempts.length > 0, "The model was asked nothing");
  for (const [index, requests] of model.attempts.entries()) {
    for (const request of requests) {
      assert.ok(!request.tools.includes("bash") && !request.tools.includes("powershell"), `Attempt ${index + 1} was offered a shell`);
      assert.deepEqual(request.tools, offered, `Attempt ${index + 1} was offered other tools`);
    }
  }
});

Then("the run's log gives each attempt the scripted model's id, its turns, and tokens and cost above zero", async function (this: RunWorld) {
  const model = scriptedModel(this);
  const attempts = attemptsIn(await runLog(this));
  assert.equal(attempts.length, model.script.length, `Expected ${model.script.length} attempts in the run's log, found ${attempts.length}`);
  for (const [index, attempt] of attempts.entries()) {
    const which = `The log's ${attempt.kind} attempt`;
    assert.equal(attempt.model, model.id, `${which} does not give the scripted model's id`);
    assert.equal(attempt.turns, model.attempts[index]?.length, `${which} does not give the turns its agent took`);
    assert.ok((attempt.tokens ?? 0) > 0, `${which} gives no tokens`);
    assert.ok((attempt.cost ?? 0) > 0, `${which} gives no cost`);
  }
});
