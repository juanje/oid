import { describe, expect, test } from "vitest";
import { OID_FACTS, systemPromptFor, taskFor } from "../../src/agent-prompt.ts";
import { AGENT_TOOLS } from "../../src/agent-tools.ts";
import { WRITABLE } from "../../src/boundaries.ts";

const SCENARIO = "A person is greeted by name";
const REFUSAL = { failed: "The test passes before its code exists: test_bug", evidence: "tests/greet.test.ts", next: "Write a test that fails" };

describe("systemPromptFor", () => {
  test("gives each kind of attempt its own prompt, naming the kind", () => {
    const prompts = (["steps", "test", "code"] as const).map((kind) => [kind, systemPromptFor(kind)] as const);

    for (const [kind, prompt] of prompts) expect(prompt).toMatch(new RegExp(`\\b${kind}\\b`));
    expect(new Set(prompts.map(([, prompt]) => prompt)).size).toBe(3);
  });

  test("states each kind's limits from the data that enforces them: the paths it may write and the tools it has", () => {
    for (const kind of ["steps", "test", "code"] as const) {
      const prompt = systemPromptFor(kind);

      for (const path of WRITABLE[kind]) expect(prompt).toContain(path);
      for (const tool of AGENT_TOOLS) expect(prompt).toMatch(new RegExp(`\\b${tool.name}\\b`));
    }
  });

  test("gives every kind the common facts from one source, as a part of its own", () => {
    for (const kind of ["steps", "test", "code"] as const) {
      expect(systemPromptFor(kind).split(/\n\s*\n/)).toContain(OID_FACTS);
    }
  });
});

const CONTEXT = { fr: "#### FR-GREET-01: Greet a person by name\n`greet(name)` returns a greeting.", steps: ['When I greet "Ada"', 'Then I get "Hello, Ada!"'] };

describe("taskFor", () => {
  test("gives the FR's text and the steps of its scenario", () => {
    const task = taskFor({ kind: "test", fr: "FR-GREET-01", scenario: SCENARIO, context: CONTEXT });

    expect(task).toContain(CONTEXT.fr);
    for (const step of CONTEXT.steps) expect(task).toContain(step);
  });


  test("names the attempt's kind, its FR and its scenario", () => {
    const task = taskFor({ kind: "test", fr: "FR-GREET-01", scenario: SCENARIO, context: CONTEXT });

    expect(task).toMatch(/\btest\b/);
    expect(task).toContain("FR-GREET-01");
    expect(task).toContain(SCENARIO);
  });

  test("gives the scenario's failure, with where its step is defined and that definition's source", () => {
    const failure = {
      step: 'When I greet "Ada"',
      message: "Error: Cannot find module '/work/src/greet.ts'",
      definition: { file: "features/steps/greet.steps.ts", line: 3, source: 'When("I greet {string}", async function () {})' },
    };

    const task = taskFor({ kind: "code", fr: "FR-GREET-01", scenario: SCENARIO, context: { ...CONTEXT, failure } });

    expect(task).toContain(failure.message);
    expect(task).toContain("features/steps/greet.steps.ts:3");
    expect(task).toContain(failure.definition.source);
  });

  test("gives the relevant files with their paths, and names the ones left out", () => {
    const code = { files: [{ path: "src/greet.ts", content: "export const greet = () => 'Hello';\n" }], cut: ["tests/huge.test.ts"] };

    const task = taskFor({ kind: "code", fr: "FR-GREET-01", scenario: SCENARIO, context: { ...CONTEXT, code } });

    expect(task).toContain("src/greet.ts");
    expect(task).toContain(code.files[0]!.content.trim());
    expect(task).toContain("tests/huge.test.ts");
  });

  test("gives the patterns of the step definitions the project has", () => {
    const patterns = ["features/steps/greet.steps.ts: I greet {string}", "features/steps/greet.steps.ts: I get {string}"];

    const task = taskFor({ kind: "steps", fr: "FR-GREET-01", scenario: SCENARIO, context: { ...CONTEXT, patterns } });

    for (const pattern of patterns) expect(task).toContain(pattern);
  });

  test("after the gate, gives each scenario in its focus, of whichever FR, with its steps and its failure", () => {
    const broken = {
      uri: "features/greet-02.feature",
      line: 4,
      name: "Two people are greeted together",
      steps: ['When I greet "Ada" and "Grace"', 'Then I get "Hello, Ada and Grace!"'],
      failure: { step: 'I get "Hello, Ada and Grace!"', kind: "Outcome" as const, status: "FAILED", message: "AssertionError: expected 'Hello, Grace and Ada!'" },
    };
    const refusal = { ...REFUSAL, focus: { scenarios: [broken], tests: [] } };

    const task = taskFor({ kind: "code", fr: "FR-GREET-03", scenario: SCENARIO, refusal, context: CONTEXT });

    expect(task).toContain("features/greet-02.feature:4");
    expect(task).toContain(broken.name);
    for (const step of broken.steps) expect(task).toContain(step);
    expect(task).toContain(broken.failure.message);
  });

  test("gives a retry the refusal of the attempt before it", () => {
    const task = taskFor({ kind: "test", fr: "FR-GREET-01", scenario: SCENARIO, refusal: REFUSAL, context: CONTEXT });

    expect(task).toContain(REFUSAL.failed);
    expect(task).toContain(REFUSAL.evidence);
    expect(task).toContain(REFUSAL.next);
  });
});
