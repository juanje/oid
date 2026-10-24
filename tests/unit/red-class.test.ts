import { describe, expect, test } from "vitest";
import { classifyFailure, classifyScenario } from "../../src/red-class.ts";

// Messages as vitest 3.2.7 and cucumber-js 13.3.0 gave them on the greet fixtures.
const nothingExists = (): boolean => false;
const greetExists = (name: string): boolean => name === "greet";

describe("classifyFailure", () => {
  test("an assertion about behaviour is business_assertion", () => {
    expect(classifyFailure("AssertionError: expected 'Hello, Ada and Grace and Linus!' to be 'Hello, Ada, Grace and Linus!' // Object.is equality", nothingExists)).toBe("business_assertion");
    expect(classifyFailure("AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:", nothingExists)).toBe("business_assertion");
  });

  test("a project module that does not exist yet is missing_implementation", () => {
    expect(classifyFailure("Cannot find module '../src/greet-all.ts' imported from '/work/tests/greet-all.test.ts'", nothingExists)).toBe("missing_implementation");
    expect(
      classifyFailure("Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/work/src/greet.ts' imported from /work/features/steps/greet.steps.ts", nothingExists),
    ).toBe("missing_implementation");
  });

  test("X is not a function, where X does not exist in the project, is missing_implementation", () => {
    expect(classifyFailure("TypeError: (0 , greetWith) is not a function", greetExists)).toBe("missing_implementation");
    expect(classifyFailure("TypeError: greetWith is not a function", greetExists)).toBe("missing_implementation");
  });

  test("a test file vitest cannot transform is test_bug", () => {
    expect(classifyFailure("Transform failed with 1 error:", nothingExists)).toBe("test_bug");
  });

  test("a package that is not installed is environment", () => {
    expect(classifyFailure("Cannot find package 'left-pad' imported from '/work/tests/greet-with.test.ts'", nothingExists)).toBe("environment");
  });

  test("anything it cannot tell is undecided", () => {
    expect(classifyFailure("Error: something unexpected", nothingExists)).toBe("undecided");
  });
});

describe("classifyScenario", () => {
  const SCENARIO = { uri: "features/greet-03.feature", line: 4, name: "A person is greeted with the chosen salutation" };
  const failedAt = (kind: "Context" | "Action" | "Outcome", status: string, message: string) => ({
    ...SCENARIO,
    status: "failed" as const,
    failure: { step: "a step", kind, status, message },
  });

  test("a scenario with an undefined or pending step is test_bug", () => {
    expect(classifyScenario(failedAt("Outcome", "UNDEFINED", ""), nothingExists)).toBe("test_bug");
    expect(classifyScenario(failedAt("Action", "PENDING", ""), nothingExists)).toBe("test_bug");
  });

  test("a scenario that fails in a Given or Background step is test_bug, whatever its message", () => {
    expect(classifyScenario(failedAt("Context", "FAILED", "TypeError: setSalutation is not a function"), nothingExists)).toBe("test_bug");
  });

  test("a scenario that fails in a When or Then step is classified by the step's message", () => {
    expect(classifyScenario(failedAt("Action", "FAILED", "TypeError: greetWith is not a function"), greetExists)).toBe("missing_implementation");
  });

  test("a scenario that passes before its code is test_bug, and one that did not run is not_run", () => {
    expect(classifyScenario({ ...SCENARIO, status: "passed" }, nothingExists)).toBe("test_bug");
    expect(classifyScenario({ ...SCENARIO, status: "not run" }, nothingExists)).toBe("not_run");
  });
});
