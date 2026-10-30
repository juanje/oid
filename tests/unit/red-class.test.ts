import { describe, expect, test } from "vitest";
import { classifyFailure, classifyScenario, missingModule } from "../../src/red-class.ts";
import { nothingExists } from "./support/symbols.ts";
import { recorded } from "./support/recorded.ts";
import { testFailures } from "../../src/vitest-report.ts";

// Messages as vitest 3.2.7 and cucumber-js 13.3.0 gave them on the greet fixtures.
const greetExists = (name: string): boolean => name === "greet";

describe("classifyFailure", () => {
  test("an assertion about behaviour is business_assertion", () => {
    expect(classifyFailure("AssertionError: expected 'Hello, Ada and Grace and Linus!' to be 'Hello, Ada, Grace and Linus!' // Object.is equality", nothingExists)).toBe("business_assertion");
    expect(classifyFailure("AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:", nothingExists)).toBe("business_assertion");
  });

  test("a promise that settles the other way than rejects or resolves asserts is business_assertion", () => {
    expect(classifyFailure(`Error: promise resolved "'Hello,  and undefined!'" instead of rejecting`, nothingExists)).toBe("business_assertion");
    expect(classifyFailure(`Error: promise rejected "Error: No one to greet" instead of resolving`, nothingExists)).toBe("business_assertion");
  });

  test("a project module that does not exist yet is missing_implementation", () => {
    expect(classifyFailure("Cannot find module '../src/greet-all.ts' imported from '/work/tests/greet-all.test.ts'", nothingExists)).toBe("missing_implementation");
    expect(
      classifyFailure("Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/work/src/greet.ts' imported from /work/features/steps/greet.steps.ts", nothingExists),
    ).toBe("missing_implementation");
  });

  test("a relative module that, from the failing file, is not under the source is test_bug: no code can create it there", () => {
    const inSource = (path: string): boolean => path.startsWith("/work/src/");
    expect(classifyFailure("Error: Cannot find module '../src/greet.ts' imported from '/work/tests/unit/greet-with.test.ts'", nothingExists, inSource)).toBe("test_bug");
    expect(classifyFailure("Error: Cannot find module '../../src/greet.ts' imported from '/work/tests/unit/greet-with.test.ts'", nothingExists, inSource)).toBe("missing_implementation");
  });

  test("the module a failure cannot find is resolved against the file that imports it", () => {
    expect(missingModule("Error: Cannot find module '../src/greet.ts' imported from '/work/tests/unit/greet-with.test.ts'")).toBe("/work/tests/src/greet.ts");
    expect(missingModule("Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/work/src/greet.ts' imported from /work/features/steps/greet.steps.ts")).toBe("/work/src/greet.ts");
    expect(missingModule("Cannot find package 'left-pad' imported from '/work/tests/greet-with.test.ts'")).toBeUndefined();
  });

  test("X is not a function, where X does not exist in the project, is missing_implementation", () => {
    expect(classifyFailure("TypeError: (0 , greetWith) is not a function", greetExists)).toBe("missing_implementation");
    expect(classifyFailure("TypeError: greetWith is not a function", greetExists)).toBe("missing_implementation");
  });

  test("X is not a function, reached as a member, is undecided whatever the project declares: oid cannot say the member is missing", () => {
    expect(classifyFailure("TypeError: resolver.resolve is not a function", nothingExists)).toBe("undecided");
    expect(classifyFailure("TypeError: this.shortener.resolve is not a function\n    at World.<anonymous> (/work/features/steps/shorten-02.steps.ts:15:44)", nothingExists)).toBe("undecided");
    expect(classifyFailure("TypeError: (intermediate value).resolve is not a function", nothingExists)).toBe("undecided");
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

describe("classifyFailure, on vitest 5's messages", () => {
  test("reads them as vitest 5 writes them: a missing export and an assertion after .resolves are undecided, accepted provisionally", () => {
    const failures = testFailures(JSON.parse(recorded("vitest5-greet/unit-report.json")), "/work");

    expect(failures.map(({ message }) => message)).toEqual([
      "TypeError: (0 , __vite_ssr_import_1__.farewel) is not a function",
      "Error: expected 'Hello, Ada!' to be 'Hi, Ada!' // Object.is equality",
    ]);
    expect(failures.map(({ message }) => classifyFailure(message, nothingExists))).toEqual(["undecided", "undecided"]);
  });
});
