import { describe, expect, test } from "vitest";
import { passedTests } from "../../src/vitest-report.ts";

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
