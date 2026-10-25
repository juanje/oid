import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { systemPromptFor, taskFor } from "../../src/agent-prompt.ts";
import type { Attempt, NextAttempt, TryResult, TryTarget } from "../../src/executor.ts";
import { piExecutor } from "../../src/pi-executor.ts";
import { type ModelAttempt, ScriptedModel } from "../../features/support/scripted-model.ts";

const SCENARIO = "A person is greeted by name";
// A prepared attempt of the greet fixture; fixture.ts itself loads cucumber, so its helpers are not imported here.
const attemptDir = (name: string) => join(import.meta.dirname, "../../fixtures/greet/attempts", name);
const QUICK_RETRIES = { maxRetries: 2, baseDelayMs: 1 };
const TOOLS = ["edit", "find", "grep", "ls", "read", "report", "try", "write"];

let worktree = "";
beforeEach(async () => {
  worktree = await mkdtemp(join(tmpdir(), "oid-pi-executor-"));
});
afterEach(async () => {
  await rm(worktree, { recursive: true, force: true });
});

/** One code attempt for GREET-01's scenario, whose try answers `tried` and whose report is kept. */
function codeAttempt(turns = 40, tried: TryResult = { passed: true }) {
  const calls = { tries: [] as TryTarget[], reports: [] as string[], next: [] as (NextAttempt | undefined)[] };
  const attempt: Attempt = {
    kind: "code",
    fr: "FR-GREET-01",
    scenario: SCENARIO,
    worktree,
    limits: { turns },
    tools: {
      try: async (target) => {
        calls.tries.push(target);
        return tried;
      },
      report: (result, next) => {
        calls.reports.push(result);
        calls.next.push(next);
      },
    },
  };
  return { attempt, calls };
}

async function scripted(attempt: Omit<ModelAttempt, "kind" | "scenario">): Promise<ScriptedModel> {
  const model = await ScriptedModel.create();
  model.script = [{ kind: "code", scenario: SCENARIO, ...attempt }];
  return model;
}

const executorOn = (model: ScriptedModel) => piExecutor({ runtime: model.runtime, model: model.model, retry: QUICK_RETRIES });

describe("piExecutor", () => {
  test("runs a fresh agent in the attempt's worktree, with its kind's system prompt, its task and oid's tools, and no shell", async () => {
    const model = await scripted({ dir: attemptDir("code") });
    const { attempt, calls } = codeAttempt();

    await executorOn(model).run(attempt);

    const [first] = model.attempts[0]!;
    expect(first!.roles).toEqual(["system", "user"]);
    expect(first!.systemPrompt).toContain(systemPromptFor("code"));
    expect(first!.task).toBe(taskFor(attempt));
    expect(first!.tools).toEqual(TOOLS);
    expect(existsSync(join(worktree, "src/greet.ts"))).toBe(true);
    expect(await readFile(join(worktree, "src/greet.ts"), "utf8")).toBe(await readFile(join(attemptDir("code"), "src/greet.ts"), "utf8"));
    expect(calls.reports).toEqual(["scripted code attempt"]);
  });

  test("gives oid's report the attempt kind the agent asks for next, with its reason", async () => {
    const next = { kind: "steps" as const, reason: "The shared Then step checks the wrong greeting" };
    const model = await scripted({ dir: attemptDir("code"), next });
    const { attempt, calls } = codeAttempt();

    await executorOn(model).run(attempt);

    expect(calls.next).toEqual([next]);
  });

  test("keeps its agent's whole session as JSONL where the attempt says, creating the directory", async () => {
    const model = await scripted({ dir: attemptDir("code") });
    const { attempt } = codeAttempt();
    const transcript = join(worktree, "runs/run-1/01-code.jsonl");

    await executorOn(model).run({ ...attempt, transcript });

    expect(existsSync(transcript)).toBe(true);
    const entries = (await readFile(transcript, "utf8")).split("\n").filter((line) => line !== "").map((line) => JSON.parse(line));
    expect(JSON.stringify(entries)).toContain(JSON.stringify(taskFor(attempt)).slice(1, -1));
    expect(JSON.stringify(entries)).toContain("scripted code attempt");
  });

  test("ends the agent after the turn in which it reports, and reports its turns, model, tokens and cost", async () => {
    const model = await scripted({ dir: attemptDir("code") });

    const outcome = await executorOn(model).run(codeAttempt().attempt);

    expect(model.attempts[0]).toHaveLength(1);
    expect(outcome).toMatchObject({ turns: 1, stoppedAtLimit: false, model: model.id });
    expect(outcome.tokens).toBeGreaterThan(0);
    expect(outcome.cost).toBeGreaterThan(0);
    expect(outcome.error).toBeUndefined();
  });

  test("reports the tokens its agent's requests read from the provider's cache", async () => {
    // Two requests in one session: faux, like a real provider, reads the second one's prefix from its cache.
    const model = await scripted({ dir: attemptDir("code"), tries: [{ scenario: true }] });

    const outcome = await executorOn(model).run(codeAttempt().attempt);

    expect(model.attempts[0]).toHaveLength(2);
    expect(outcome.cacheRead).toBeGreaterThan(0);
    expect(outcome.cacheRead).toBeLessThan(outcome.tokens!);
  });

  test("gives try's target to oid's try, and its answer back to the model", async () => {
    const model = await scripted({ dir: attemptDir("code"), tries: [{ scenario: true }, { test: "tests/greet.test.ts" }] });
    const refused = { passed: false as const, failed: "The scenario fails", evidence: "expected greeting", next: "Fix greet" };
    const { attempt, calls } = codeAttempt(40, refused);

    await executorOn(model).run(attempt);

    expect(calls.tries).toEqual([{ scenario: true }, { test: "tests/greet.test.ts" }]);
    expect(model.attempts[0]![1]!.toolResults.join("\n")).toContain("expected greeting");
  });

  test("ends the agent between turns at the turn limit, and says so", async () => {
    const model = await scripted({ loops: true });

    const outcome = await executorOn(model).run(codeAttempt(3).attempt);

    expect(model.attempts[0]).toHaveLength(3);
    expect(outcome).toMatchObject({ turns: 3, stoppedAtLimit: true });
  });

  test("reports a provider error that Pi's own retries did not clear", async () => {
    const model = await scripted({ error: "529 overloaded_error: the scripted provider is overloaded" });

    const outcome = await executorOn(model).run(codeAttempt().attempt);

    expect(model.attempts[0]).toHaveLength(1 + QUICK_RETRIES.maxRetries);
    expect(outcome.error).toContain("the scripted provider is overloaded");
  });
});
