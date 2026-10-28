import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import type { AttemptKind } from "../../src/executor.ts";
import { GREET_01_SCENARIO, OID_ROOT, attemptDir, commitProjectConfig, git } from "../support/fixture.ts";
import { assertOutputNames, attemptsIn, configDirOf, noteBeforeRun, runLog, runOid, scriptedModel } from "../support/run.ts";
import { type ModelAttempt, ScriptedModel } from "../support/scripted-model.ts";
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

/** The index of the prepared attempt of `kind` in the scripted model's script. */
function modelAttemptOf(model: ScriptedModel, kind: AttemptKind): number {
  const index = model.script.findIndex((attempt) => attempt.kind === kind);
  assert.notEqual(index, -1, `No prepared ${kind} attempt for the scripted model`);
  return index;
}

/** Has the scripted model answer the code attempt with `answer` instead of writing its files. */
function codeAttemptAnswers(world: RunWorld, answer: Pick<ModelAttempt, "loops" | "error">): void {
  const model = scriptedModel(world);
  const index = modelAttemptOf(model, "code");
  model.script[index] = { kind: "code", scenario: model.script[index]!.scenario, ...answer };
}

Given("the scripted model keeps calling tools in the code attempt without ending it", function (this: RunWorld) {
  codeAttemptAnswers(this, { loops: true });
});

Then("the scripted model was asked for {int} turns in the code attempt", function (this: RunWorld, turns: number) {
  const model = scriptedModel(this);
  assert.equal(model.attempts[modelAttemptOf(model, "code")]?.length, turns, "The code attempt's agent was not ended at its turn limit");
});

const PROVIDER_ERROR = "529 overloaded_error: the scripted provider is overloaded";

Given("the scripted model answers the code attempt with a provider error every time", function (this: RunWorld) {
  codeAttemptAnswers(this, { error: PROVIDER_ERROR });
  // oid's own retry of the attempt is a session of its own, and gets the error too.
  errorThenRetry(this, { error: PROVIDER_ERROR });
});

/** Puts `retry` right after the code attempt, as what the model answers a session that retries it. */
function errorThenRetry(world: RunWorld, retry: Omit<ModelAttempt, "kind" | "scenario">): void {
  const model = scriptedModel(world);
  const index = modelAttemptOf(model, "code");
  model.script.splice(index + 1, 0, { kind: "code", scenario: model.script[index]!.scenario, ...retry });
}

Given("the scripted model answers the code attempt's first turn with a provider error, then builds it", function (this: RunWorld) {
  const builds = scriptedModel(this).script[modelAttemptOf(scriptedModel(this), "code")]!;
  codeAttemptAnswers(this, { error: PROVIDER_ERROR });
  errorThenRetry(this, { dir: builds.dir! });
});

const OUT_OF_CREDIT = "400 invalid_request_error: Your credit balance is too low to access the API. Please go to Plans & Billing to upgrade or purchase credits.";

Given("the scripted model answers the code attempt with a provider error that says the account is out of credit", function (this: RunWorld) {
  const builds = scriptedModel(this).script[modelAttemptOf(scriptedModel(this), "code")]!;
  codeAttemptAnswers(this, { error: OUT_OF_CREDIT });
  // What a retry would get: a run that retried would build, and not stop.
  errorThenRetry(this, { dir: builds.dir! });
});

Then("the scripted model was asked for one turn in the code attempt", function (this: RunWorld) {
  const model = scriptedModel(this);
  // Every session of a code attempt, a retry's included.
  const asked = model.attempts.filter((_, index) => model.script[index]?.kind === "code").reduce((total, requests) => total + requests.length, 0);
  assert.equal(asked, 1, `The scripted model was asked for ${asked} turns in the code attempt`);
});

Then("the run's log gives the code attempt one provider retry and no rejection", async function (this: RunWorld) {
  const log = await runLog(this);
  const retries = log.filter((event) => event.event === "attempting" && event.kind === "code" && event.providerRetry === true);
  assert.equal(retries.length, 1, `The run's log gives the code attempt ${retries.length} provider retries`);
  const end = log.find((event) => event.event === "end");
  assert.ok(end?.event === "end", "The run's log has no measures");
  assert.equal(end.measures.rejections.code, undefined, `The run's measures count a rejection of the code attempt: ${JSON.stringify(end.measures.rejections)}`);
});

Then("the output names the provider error", function (this: RunWorld) {
  // The error the scripted model answers the code attempt with.
  assertOutputNames(this, scriptedModel(this).script.find((attempt) => attempt.error !== undefined)?.error);
});

Given("the project has a .pi\\/settings.json that would change the agent's tools", async function (this: RunWorld) {
  // Pi gives these tools to a session that takes its tools from the settings, project ones included (DOMAIN.md, Pi SDK).
  await mkdir(join(this.projectDir, ".pi"), { recursive: true });
  await writeFile(join(this.projectDir, ".pi/settings.json"), `${JSON.stringify({ defaultTools: ["read", "bash"] }, null, 2)}\n`);
  git(this.projectDir, "add", ".pi/settings.json");
  git(this.projectDir, "commit", "-q", "-m", "chore: the project's Pi settings");
});

Given("my personal config names the real model in OID_SMOKE_MODEL", async function (this: RunWorld) {
  const name = process.env.OID_SMOKE_MODEL;
  assert.ok(name !== undefined && name !== "", 'Name the real model: OID_SMOKE_MODEL=<provider>/<model> NODE_OPTIONS="--import tsx" npx cucumber-js -p smoke');
  this.smokeModel = name;
  await personalModel(this, name);
});

Then("the run ends without an error or a crash", function (this: RunWorld) {
  assert.equal(this.crash, undefined, `The run crashed:\n${String(this.crash)}`);
  assert.ok([0, 1, 3].includes(this.exitCode ?? -1), `The run stopped with exit code ${this.exitCode}. Output:\n${this.output}`);
});

Then("the run's log gives each attempt the real model's id, its turns, and tokens above zero", async function (this: RunWorld) {
  const attempts = attemptsIn(await runLog(this));
  assert.ok(attempts.length > 0, "The run's log has no attempt");
  for (const attempt of attempts) {
    const which = `The log's ${attempt.kind} attempt`;
    assert.equal(attempt.model, this.smokeModel, `${which} does not give the real model's id`);
    assert.ok(attempt.turns > 0, `${which} gives no turns`);
    assert.ok((attempt.tokens ?? 0) > 0, `${which} gives no tokens`);
  }
});

/** Writes `model` into the project's .oid.json, keeping the rest; committed, as the person would. */
async function projectModel(world: RunWorld, model: string): Promise<void> {
  await commitProjectConfig(world.projectDir, (config) => (config.model = model), "chore: a model in the project's config");
}

/** Writes my personal config, in this scenario's own config dir, naming `model` or none. */
async function personalModel(world: RunWorld, model: string | undefined): Promise<void> {
  await writeFile(personalConfigFile(world), `${JSON.stringify(model === undefined ? {} : { model }, null, 2)}\n`);
}

/** The personal config file of this scenario's own config dir: never the person's ~/.config/oid. */
function personalConfigFile(world: RunWorld): string {
  return join(configDirOf(world), "config.json");
}

Given("my personal config names the scripted model", async function (this: RunWorld) {
  await personalModel(this, scriptedModel(this).id);
});

Given("my personal config names no model", async function (this: RunWorld) {
  await personalModel(this, undefined);
});

Given("my personal config names the model {}", async function (this: RunWorld, model: string) {
  await personalModel(this, model);
});

Given("the project's .oid.json names the model {}", async function (this: RunWorld, model: string) {
  await projectModel(this, model);
});

When("I run {string} with the executor oid makes from its config", async function (this: RunWorld, command: string) {
  const [program, ...args] = command.split(" ");
  assert.equal(program, "oid");
  noteBeforeRun(this);
  const model = scriptedModel(this);
  // oid's own path from config to executor, with the scripted model's registry in place of Pi's.
  const { executorFromConfig } = await import("../../src/pi-model.ts");
  const configDir = configDirOf(this);
  Object.assign(this, await runOid(this.projectDir, args, () => executorFromConfig(this.projectDir, { configDir, runtime: model.runtime })));
});

Then("the output names my personal config's path", function (this: RunWorld) {
  assertOutputNames(this, personalConfigFile(this));
});

Then("the output names .oid.json and my personal config's path", function (this: RunWorld) {
  assertOutputNames(this, ".oid.json");
  assertOutputNames(this, personalConfigFile(this));
});

Then(/^the output names (nowhere\/no-such-model)$/, function (this: RunWorld, model: string) {
  assertOutputNames(this, model);
});

Then("the scripted model was asked nothing", function (this: RunWorld) {
  assert.equal(scriptedModel(this).attempts.length, 0, "The scripted model was asked for an attempt");
});

Then("the run's summary is shown: what it built or not, where it stopped, its attempts and its cost", function (this: RunWorld) {
  const summary = this.output.slice(this.output.lastIndexOf("Summary of"));
  assert.ok(this.output.includes("Summary of"), `The run printed no summary:\n${this.output}`);
  assert.match(summary, /\b(built|not built)\b/, `The summary does not say what was built:\n${summary}`);
  assert.match(summary, /attempts .*cost/, `The summary does not give the attempts and the cost:\n${summary}`);
  // Shown whether the scenario passes or not: the person running the smoke scenario reads it.
  process.stdout.write(`\n${summary}\n`);
});

Then("a copy of the run's log is kept outside the temporary directory, and its path is shown", async function (this: RunWorld) {
  const runs = join(this.projectDir, ".git/oid/runs");
  const log = (await readdir(runs)).find((name) => name.endsWith(".jsonl"));
  assert.ok(log !== undefined, `The run left no log in ${runs}`);
  // In oid's own .git: never committed, and not deleted with the fixture. The transcripts beside the log go with it.
  const kept = join(OID_ROOT, ".git/oid-smoke", log);
  await mkdir(dirname(kept), { recursive: true });
  await copyFile(join(runs, log), kept);
  const transcripts = join(runs, log.replace(/\.jsonl$/, ""));
  if (existsSync(transcripts)) await cp(transcripts, kept.replace(/\.jsonl$/, ""), { recursive: true });
  process.stdout.write(`The run's log is kept in ${kept}, and its transcripts in ${kept.replace(/\.jsonl$/, "")}/\n`);
});

Given("the run uses oid's default limits, as a real run does", async function (this: RunWorld) {
  // The Background allows no retries; a real run's .oid.json usually sets no limits.
  const path = join(this.projectDir, ".oid.json");
  const config = existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : {};
  delete config.limits;
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
  git(this.projectDir, "add", ".oid.json");
  git(this.projectDir, "commit", "-q", "--allow-empty", "-m", "chore: oid's default limits");
});

Given("the project's .oid.json sets the output limit to {int} tokens", async function (this: RunWorld, tokens: number) {
  await commitProjectConfig(this.projectDir, (config) => (config.limits = { ...config.limits, outputTokens: tokens }), "chore: the output limit");
});

Given("the scripted model answers the code attempt's first turn with 1,000 tokens of output, then builds it in its next turn", function (this: RunWorld) {
  const model = scriptedModel(this);
  const index = modelAttemptOf(model, "code");
  model.script[index] = { ...model.script[index]!, floods: 1000 };
});

Then("the scripted model was asked for at most {int} tokens of output in each turn", function (this: RunWorld, tokens: number) {
  const requests = scriptedModel(this).attempts.flat();
  assert.ok(requests.length > 0, "The model was asked nothing");
  const over = requests.filter((request) => request.maxTokens === undefined || request.maxTokens > tokens);
  assert.deepEqual(over.map((request) => request.maxTokens), [], `${over.length} of ${requests.length} requests asked for more than ${tokens} tokens of output, or set no limit`);
});

Then("the run's log counts one turn cut, in the code attempt", async function (this: RunWorld) {
  const end = (await runLog(this)).find((event) => event.event === "end");
  assert.ok(end?.event === "end", "The run's log has no measures");
  assert.deepEqual(end.measures.cutTurns, { code: 1 }, `The run's measures do not count one turn cut, in the code attempt: ${JSON.stringify(end.measures.cutTurns)}`);
});
