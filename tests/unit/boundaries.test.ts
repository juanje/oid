import { describe, expect, test } from "vitest";
import { forbiddenLines, outsideBoundary } from "../../src/boundaries.ts";

describe("outsideBoundary", () => {
  test("a test attempt may write unit tests only", () => {
    expect(outsideBoundary("test", ["tests/greet.test.ts", "src/greet.ts"])).toEqual(["src/greet.ts"]);
  });

  test("a steps attempt may write step definitions and their support, never a feature file", () => {
    expect(outsideBoundary("steps", ["features/steps/greet.steps.ts", "features/support/world.ts", "features/greet-01.feature", "features/steps/x.feature"])).toEqual([
      "features/greet-01.feature",
      "features/steps/x.feature",
    ]);
  });

  test("a code attempt may write source only, never the gate's configuration", () => {
    expect(outsideBoundary("code", ["src/greet.ts", "package.json", "tsconfig.json"])).toEqual(["package.json", "tsconfig.json"]);
  });
});

describe("forbiddenLines", () => {
  test("finds .only, .skip and branches on the test environment in added lines, with their file", () => {
    const added = [
      { file: "tests/greet.test.ts", text: 'test.only("greets", () => {' },
      { file: "tests/greet.test.ts", text: 'describe.skip("greeting", () => {' },
      { file: "src/greet.ts", text: "  if (process.env.VITEST) return `Hello, ${name}!`;" },
      { file: "src/greet.ts", text: "  return `Hello, ${name}!`;" },
    ];

    expect(forbiddenLines(added)).toEqual([
      { file: "tests/greet.test.ts", pattern: ".only", text: 'test.only("greets", () => {' },
      { file: "tests/greet.test.ts", pattern: ".skip", text: 'describe.skip("greeting", () => {' },
      { file: "src/greet.ts", pattern: "process.env.VITEST", text: "  if (process.env.VITEST) return `Hello, ${name}!`;" },
    ]);
  });
});
