import { describe, expect, test } from "vitest";
import { classifyFailure } from "../../src/red-class.ts";

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

  test("anything it cannot tell is undecided", () => {
    expect(classifyFailure("Error: something unexpected", nothingExists)).toBe("undecided");
  });
});
