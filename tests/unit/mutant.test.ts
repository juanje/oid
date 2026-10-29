import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { applyMutant, judgeScenarioUnderMutant, judgeTestsUnderMutant } from "../../src/mutant.ts";
import { nothingExists } from "./support/symbols.ts";
import { tempRepo } from "./support/repo.ts";

const SOURCE = "export function greetAll(names: string[]): string {\n  return `Hello, ${names.join(\", \")}!`;\n}\n";
const mutant = (path: string, oldText: string, newText: string) => ({ reason: "why", files: [{ path, edits: [{ oldText, newText }] }] });

describe("applyMutant", () => {
  test("applies edits to source files, each to the one place its old text is", async () => {
    const dir = await tempRepo({ "src/greet-all.ts": SOURCE });

    const refusal = await applyMutant(dir, mutant("src/greet-all.ts", 'names.join(", ")', 'names.join(" and ")'));

    expect({ refusal, source: await readFile(join(dir, "src/greet-all.ts"), "utf8") }).toEqual({ refusal: undefined, source: SOURCE.replace('", "', '" and "') });
  });

  test("refuses edits to a file that is not source, naming it, and applies nothing", async () => {
    const dir = await tempRepo({ "src/greet-all.ts": SOURCE, "features/steps/greet.steps.ts": "greetAll([a, b]);\n" });

    const refusal = await applyMutant(dir, { reason: "why", files: [...mutant("src/greet-all.ts", "names", "list").files, ...mutant("features/steps/greet.steps.ts", "[a, b]", "[b, a]").files] });

    expect(refusal?.evidence).toContain("features/steps/greet.steps.ts");
    expect(await readFile(join(dir, "src/greet-all.ts"), "utf8")).toBe(SOURCE);
  });

  test("takes the source where the project keeps it", async () => {
    const dir = await tempRepo({ "lib/greet-all.ts": SOURCE, "src/greet-all.ts": SOURCE });

    const inLib = await applyMutant(dir, mutant("lib/greet-all.ts", "names", "list"), ["lib/"]);
    const inSrc = await applyMutant(dir, mutant("src/greet-all.ts", 'names.join(", ")', "x"), ["lib/"]);

    expect(inLib?.evidence).not.toContain("not source");
    expect(inSrc?.evidence).toContain("src/greet-all.ts");
    expect(inSrc?.next).toContain("lib/");
  });

  test("refuses an edit whose old text is not in its file exactly once, naming the file", async () => {
    const dir = await tempRepo({ "src/greet-all.ts": SOURCE });

    const missing = await applyMutant(dir, mutant("src/greet-all.ts", "goodbye", "hello"));
    const twice = await applyMutant(dir, mutant("src/greet-all.ts", "names", "list"));

    expect([missing?.evidence, twice?.evidence]).toEqual([expect.stringContaining("src/greet-all.ts"), expect.stringContaining("src/greet-all.ts")]);
  });
});

const SCENARIO = { uri: "features/greet-02.feature", line: 8, name: "Three people are greeted as a list" };

describe("judgeScenarioUnderMutant", () => {
  test("accepts a scenario that fails on an assertion under the mutant", () => {
    const failure = { step: 'I get "Hello, Ada, Grace and Linus!"', kind: "Outcome" as const, status: "FAILED", message: "AssertionError [ERR_ASSERTION]: Expected values to be strictly equal" };

    expect(judgeScenarioUnderMutant({ ...SCENARIO, status: "failed", failure }, nothingExists)).toBeUndefined();
  });

  test("refuses a scenario that does not finish under the mutant, saying so and naming it", () => {
    const stopped = { step: 'I greet "Ada", "Grace" and "Linus"', kind: "Action" as const, status: "NOT FINISHED", message: "did not finish within 5 s" };

    const refusal = judgeScenarioUnderMutant({ ...SCENARIO, status: "failed", failure: stopped }, nothingExists);

    expect(refusal?.failed).toMatch(/does not finish under the mutant/);
    expect(refusal?.evidence).toContain(SCENARIO.name);
    expect(refusal?.evidence).toContain("did not finish within 5 s");
  });

  test("refuses a scenario that still passes under the mutant, or fails with any other class, naming it", () => {
    const missing = { step: 'I greet "Ada", "Grace" and "Linus"', kind: "Action" as const, status: "FAILED", message: "TypeError: greetAll is not a function" };

    const passes = judgeScenarioUnderMutant({ ...SCENARIO, status: "passed" }, nothingExists);
    const calls = judgeScenarioUnderMutant({ ...SCENARIO, status: "failed", failure: missing }, nothingExists);

    expect(passes?.evidence).toContain(SCENARIO.name);
    expect(calls?.failed).toContain("missing_implementation");
  });
});

describe("judgeTestsUnderMutant", () => {
  const unit = (failures: { test: string; message: string }[], passed: string[] = []) => ({ ran: true, passed, failed: failures.map((f) => f.test), failures, output: "" });
  const TEST = "tests/greet-list.test.ts > greets three people as a list";

  test("accepts when each test that passed before its code fails on an assertion under the mutant, giving each a Red through the mutant", () => {
    const judged = judgeTestsUnderMutant(unit([{ test: TEST, message: "AssertionError: expected 'Hello, Ada and Grace and Linus!' to be 'Hello, Ada, Grace and Linus!'" }]), [TEST], nothingExists);

    expect(judged).toEqual({ reds: [`${TEST}: business_assertion (mutant)`] });
  });

  test("refuses a test that still passes under the mutant, or fails with any other class, naming it", () => {
    const passes = judgeTestsUnderMutant(unit([], [TEST]), [TEST], nothingExists);
    const calls = judgeTestsUnderMutant(unit([{ test: TEST, message: "TypeError: (0 , greetAll) is not a function" }]), [TEST], nothingExists);

    expect(["refusal" in passes && passes.refusal.evidence, "refusal" in calls && calls.refusal.failed]).toEqual([expect.stringContaining(TEST), expect.stringContaining("missing_implementation")]);
  });
});
