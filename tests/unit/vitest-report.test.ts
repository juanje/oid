import { describe, expect, test } from "vitest";
import { failedTests, passedTests, testFailures } from "../../src/vitest-report.ts";
import { recorded } from "./support/recorded.ts";

describe("passedTests", () => {
  test("names each passed test by its file, relative to the root, and its full name", () => {
    const report = {
      testResults: [
        {
          name: "/work/tests/greet.test.ts",
          status: "failed",
          assertionResults: [
            { fullName: "greet says hello", status: "passed" },
            { fullName: "greet says goodbye", status: "failed" },
          ],
        },
        {
          name: "/work/tests/missing.test.ts",
          status: "failed",
          assertionResults: [],
        },
      ],
    };

    expect(passedTests(report, "/work")).toEqual(["tests/greet.test.ts > greet says hello"]);
  });
});

describe("failedTests", () => {
  test("names a failed test by its file and full name", () => {
    const report = JSON.parse(recorded("vitest-greet-02-assert.json"));

    expect(failedTests(report, "/work")).toEqual(["tests/greet-all.test.ts > greets two people together"]);
  });

  test("names a test file that failed to load by its file and message", () => {
    const report = JSON.parse(recorded("vitest-greet-02-load.json"));

    expect(failedTests(report, "/work")).toEqual([
      "tests/greet-all.test.ts: Cannot find module '../src/greet-all.ts' imported from '/work/tests/greet-all.test.ts'",
    ]);
  });
});

describe("testFailures", () => {
  test("gives each failed test with the first line of its failure message", () => {
    const report = JSON.parse(recorded("vitest-greet-02-assert.json"));

    expect(testFailures(report, "/work")).toEqual([
      { test: "tests/greet-all.test.ts > greets two people together", message: "AssertionError: expected 'Hello, Ada!' to be 'Hello, Ada and Grace!' // Object.is equality" },
    ]);
  });

  test("gives a test file that failed to load as the file, with the file's message", () => {
    const report = JSON.parse(recorded("vitest-greet-02-load.json"));

    expect(testFailures(report, "/work")).toEqual([
      { test: "tests/greet-all.test.ts", message: "Cannot find module '../src/greet-all.ts' imported from '/work/tests/greet-all.test.ts'" },
    ]);
  });
});
