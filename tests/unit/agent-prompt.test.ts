import { describe, expect, test } from "vitest";
import { CALL_AS_OFFERED, OID_FACTS, systemPromptFor, taskFor } from "../../src/agent-prompt.ts";
import { AGENT_TOOLS } from "../../src/agent-tools.ts";
import { type Layout, WRITABLE } from "../../src/boundaries.ts";
import { RUNNERS } from "../../src/runners.ts";

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

  test("tells each kind which kind of attempt owns the other paths, from the paths each may write, so that it can ask for it", () => {
    for (const kind of ["steps", "test", "code"] as const) {
      const prompt = systemPromptFor(kind);

      for (const other of (["steps", "test", "code"] as const).filter((one) => one !== kind)) {
        for (const path of WRITABLE[other]) expect(prompt).toMatch(new RegExp(`\\b${other}\\b[^\\n]*${path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`));
      }
    }
  });

  test("states the paths, the other kinds' paths and the spec where the project keeps them", () => {
    const layout: Layout = { spec: "specs/SPEC.md", features: "specs/features/", writable: { steps: ["tests/steps/"], test: ["tests/unit/"], code: ["src/", "shared/"] } };

    for (const kind of ["steps", "test", "code"] as const) {
      const prompt = systemPromptFor(kind, layout);

      for (const other of ["steps", "test", "code"] as const) for (const path of layout.writable[other]) expect(prompt).toContain(path);
      expect(prompt).toContain("specs/SPEC.md");
      expect(prompt.replaceAll("specs/SPEC.md", "")).not.toContain("SPEC.md");
    }
  });

  test("gives the steps and test agents, who write a Red before its code exists, the value of calling the code as it will be offered; not the code agent", () => {
    for (const kind of ["steps", "test"] as const) {
      expect(CALL_AS_OFFERED[kind]).toBeDefined();
      expect(systemPromptFor(kind)).toContain(CALL_AS_OFFERED[kind]);
    }
    const code = systemPromptFor("code");
    expect(CALL_AS_OFFERED.code).toBeUndefined();
    for (const value of Object.values(CALL_AS_OFFERED)) expect(code).not.toContain(value);
  });

  test("tells the test and steps agents the runner oid runs their files with, and what those files import from it", () => {
    for (const [kind, runner] of [["test", RUNNERS.unit], ["steps", RUNNERS.scenarios]] as const) {
      const prompt = systemPromptFor(kind);

      expect(prompt).toContain(runner.bin);
      expect(prompt).toContain(runner.module);
      for (const name of runner.imports) expect(prompt).toMatch(new RegExp(`\\b${name}\\b`));
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

  test("gives the project's domain and its conventions", () => {
    const texts = { domain: "A greeting is one sentence.", conventions: "Functions are pure, because scenarios call them." };

    const task = taskFor({ kind: "code", fr: "FR-GREET-01", scenario: SCENARIO, context: { ...CONTEXT, ...texts } });

    expect(task).toContain(texts.domain);
    expect(task).toContain(texts.conventions);
  });

  test("gives an attempt another one asked for which kind asked for it, and why", () => {
    const task = taskFor({ kind: "steps", fr: "FR-GREET-02", scenario: SCENARIO, asked: { by: "code", reason: "The shared Then step checks the wrong greeting" }, context: CONTEXT });

    expect(task).toContain("The shared Then step checks the wrong greeting");
    expect(task).toMatch(/\bcode attempt\b/);
  });

  test("opens the task of an attempt the gate sent back with its job, from the gate's refusal, and gives the refusal before the FR and the steps", () => {
    const refusal = { failed: "The gate failed: types: FAIL", evidence: "features/steps/greet.steps.ts(3,1): error TS2532: Object is possibly 'undefined'.", next: "Fix these errors", from: "gate" as const };

    const task = taskFor({ kind: "steps", fr: "FR-GREET-01", scenario: SCENARIO, refusal, context: CONTEXT });

    expect(task.split("\n\n")[0]).toContain(refusal.failed);
    expect(task.indexOf(refusal.evidence)).toBeLessThan(task.indexOf(CONTEXT.fr));
    expect(task.indexOf(refusal.evidence)).toBeLessThan(task.indexOf(CONTEXT.steps[0]!));
  });

  test("opens the task of an attempt another asked for with its job, naming who asked, and gives the reason and the scenario's failure before the FR and the steps", () => {
    const failure = { step: 'I get "Hello, Ada!"', message: "AssertionError: 'Hello, !' !== 'Hello, Ada!'" };
    const reason = "The shared Then step checks the wrong greeting";

    const task = taskFor({ kind: "steps", fr: "FR-GREET-01", scenario: SCENARIO, asked: { by: "code", reason }, context: { ...CONTEXT, failure } });

    expect(task.split("\n\n")[0]).toMatch(/\bcode\b/);
    for (const evidence of [reason, failure.message]) {
      expect(task.indexOf(evidence)).toBeLessThan(task.indexOf(CONTEXT.fr));
      expect(task.indexOf(evidence)).toBeLessThan(task.indexOf(CONTEXT.steps[0]!));
    }
  });

  test("keeps a retry after the attempt's own refusal as it was: the kind's work first, the refusal after the FR", () => {
    const task = taskFor({ kind: "test", fr: "FR-GREET-01", scenario: SCENARIO, refusal: REFUSAL, context: CONTEXT });

    expect(task.split("\n\n")[0]).toMatch(/\btest\b/);
    expect(task.split("\n\n")[0]).not.toContain(REFUSAL.failed);
    expect(task.indexOf(CONTEXT.fr)).toBeLessThan(task.indexOf(REFUSAL.failed));
  });

  test("gives a retry the refusal of the attempt before it", () => {
    const task = taskFor({ kind: "test", fr: "FR-GREET-01", scenario: SCENARIO, refusal: REFUSAL, context: CONTEXT });

    expect(task).toContain(REFUSAL.failed);
    expect(task).toContain(REFUSAL.evidence);
    expect(task).toContain(REFUSAL.next);
  });
});

describe("the cleanup agent's prompt (FR-REF-02)", () => {
  test("has the common facts, its own identity apart from the code agent's, the source paths it may write and the tools", () => {
    const prompt = systemPromptFor("refactor-code");

    expect(prompt.split(/\n\s*\n/)).toContain(OID_FACTS);
    expect(prompt).not.toBe(systemPromptFor("code"));
    for (const path of WRITABLE.code) expect(prompt).toContain(path);
    for (const tool of AGENT_TOOLS) expect(prompt).toMatch(new RegExp(`\\b${tool.name}\\b`));
  });

  test("a cleanup task opens with its job and gives the finding, the FR and no scenario steps", () => {
    const finding = "duplication: src/greet-all.ts:2-8 (greetAll) repeats src/greet.ts:2-7 (greet): 5 duplicated lines";
    const task = taskFor({ kind: "refactor-code", fr: "FR-GREET-02", scenario: SCENARIO, context: { ...CONTEXT, steps: [], finding } });

    expect(task).toContain(finding);
    expect(task).toContain("FR-GREET-02");
    expect(task).toContain(CONTEXT.fr);
    expect(task).not.toContain("Write the refactor-code attempt");
  });

  test("a cleanup task gives the source's function signatures, the bodies of the functions its finding calls, and asks for the smallest shared rule", () => {
    const finding = "duplication: src/greet-all.ts:2-8 (greetAll) repeats src/greet.ts:2-7 (greet): 5 duplicated lines";
    const functions = ["src/greet.ts: greet(name: string): string", "src/letters.ts: lettersIn(name: string): number"];
    const calls = [{ file: "src/letters.ts", name: "lettersIn", text: "export function lettersIn(name: string): number {\n  return [...name].length;\n}" }];
    const task = taskFor({ kind: "refactor-code", fr: "FR-GREET-02", scenario: SCENARIO, context: { ...CONTEXT, steps: [], finding, functions, calls } });

    for (const signature of functions) expect(task).toContain(signature);
    expect(task).toContain(calls[0]!.text);
    expect(task).toMatch(/\bsmallest\b.*\brule\b/);
  });

  test("a cleanup's system prompt says its report may carry a note for the person, which changes nothing", () => {
    expect(systemPromptFor("refactor-code")).toMatch(/\bnote\b.*\bperson\b/);
  });

  test("a cleanup retry is given the refused attempt's diff after its refusal, so it can finish what it started", () => {
    const finding = "duplication: src/greet-all.ts:2-8 (greetAll) repeats src/greet.ts:2-7 (greet): 5 duplicated lines";
    const diff = "--- a/src/greet.ts\n+++ b/src/greet.ts\n+  requireName(trimmed);";
    const refusal = { failed: "The cleanup's finding is still there", evidence: finding, next: "Finish it", diff };
    const task = taskFor({ kind: "refactor-code", fr: "FR-GREET-02", scenario: SCENARIO, refusal, context: { ...CONTEXT, steps: [], finding } });

    expect(task).toContain(diff);
    expect(task.indexOf(diff)).toBeGreaterThan(task.indexOf(refusal.failed));
  });
});
