import { describe, expect, test } from "vitest";
import { systemPromptFor, taskFor } from "../../src/agent-prompt.ts";

const SCENARIO = "A person is greeted by name";
const REFUSAL = { failed: "The test passes before its code exists: test_bug", evidence: "tests/greet.test.ts", next: "Write a test that fails" };

describe("systemPromptFor", () => {
  test("gives each kind of attempt its own prompt, naming the kind", () => {
    const prompts = (["steps", "test", "code"] as const).map((kind) => [kind, systemPromptFor(kind)] as const);

    for (const [kind, prompt] of prompts) expect(prompt).toMatch(new RegExp(`\\b${kind}\\b`));
    expect(new Set(prompts.map(([, prompt]) => prompt)).size).toBe(3);
  });
});

describe("taskFor", () => {
  test("names the attempt's kind, its FR and its scenario", () => {
    const task = taskFor({ kind: "test", fr: "FR-GREET-01", scenario: SCENARIO });

    expect(task).toMatch(/\btest\b/);
    expect(task).toContain("FR-GREET-01");
    expect(task).toContain(SCENARIO);
  });

  test("gives a retry the refusal of the attempt before it", () => {
    const task = taskFor({ kind: "test", fr: "FR-GREET-01", scenario: SCENARIO, refusal: REFUSAL });

    expect(task).toContain(REFUSAL.failed);
    expect(task).toContain(REFUSAL.evidence);
    expect(task).toContain(REFUSAL.next);
  });
});
