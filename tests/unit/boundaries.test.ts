import { describe, expect, test } from "vitest";
import { DEFAULT_LAYOUT, type Layout, forbiddenLines, isTestFile, judgeBoundary, outsideBoundary, ownerOf } from "../../src/boundaries.ts";

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

describe("outsideBoundary, at the paths the project names", () => {
  const layout: Layout = {
    spec: "specs/SPEC.md",
    features: "specs/features/",
    writable: { steps: ["tests/steps/", "tests/support/"], test: ["tests/unit/"], code: ["src/", "shared/"] },
  };

  test("each kind writes under its own paths only", () => {
    expect(outsideBoundary("code", ["shared/names.ts", "src/greet.ts", "tests/unit/greet.test.ts"], layout)).toEqual(["tests/unit/greet.test.ts"]);
    expect(outsideBoundary("test", ["tests/unit/greet.test.ts", "tests/steps/greet.steps.ts"], layout)).toEqual(["tests/steps/greet.steps.ts"]);
  });

  test("no kind writes the gate's configuration, wherever it sits", () => {
    const files = ["shared/vitest.config.ts", "src/package.json", "shared/tsconfig.build.json", "src/cucumber.mjs", "shared/eslint.config.js", "src/pnpm-lock.yaml", "src/greet.ts"];

    expect(outsideBoundary("code", files, layout)).toEqual(files.slice(0, -1));
  });

  test("no kind writes the spec, a feature file or oid's state, whatever the paths say", () => {
    const loose: Layout = { spec: "src/SPEC.md", features: "src/features/", writable: { ...layout.writable, code: ["src/", ".oid/"] } };

    expect(outsideBoundary("code", ["src/SPEC.md", "src/features/README.md", "src/x.feature", ".oid/progress.json", "src/greet.ts"], loose)).toEqual([
      "src/SPEC.md",
      "src/features/README.md",
      "src/x.feature",
      ".oid/progress.json",
    ]);
  });

  test("no kind writes a file a runner's configuration loads, wherever it sits", () => {
    const loading: Layout = { ...layout, loaded: ["tests/support/setup.ts"] };

    expect(outsideBoundary("steps", ["tests/support/setup.ts", "tests/support/world.ts"], loading)).toEqual(["tests/support/setup.ts"]);
  });

  test("steps inside the features' directory are the steps', as cucumber-js lays them out", () => {
    expect(outsideBoundary("steps", ["features/steps/greet.steps.ts", "features/notes.md"], DEFAULT_LAYOUT)).toEqual(["features/notes.md"]);
  });
});

describe("at the paths the project names", () => {
  const layout: Layout = {
    spec: "specs/SPEC.md",
    features: "specs/features/",
    writable: { steps: ["tests/steps/", "tests/support/"], test: ["tests/unit/"], code: ["src/", "shared/"] },
  };

  test("judgeBoundary tells the attempt the paths it may write, and the spec no attempt writes", () => {
    const refusal = judgeBoundary("test", { files: ["tests/unit/greet.test.ts", "tests/steps/greet.steps.ts"], added: [] }, layout);

    expect(refusal?.evidence).toBe("tests/steps/greet.steps.ts");
    expect(refusal?.next).toContain("tests/unit/");
    expect(refusal?.next).toContain("specs/SPEC.md");
  });

  test("ownerOf gives a file to the kind whose paths hold it, and a file no kind writes to a code attempt", () => {
    expect(["tests/steps/a.steps.ts", "tests/support/world.ts", "tests/unit/a.test.ts", "shared/names.ts", "vitest.config.ts"].map((file) => ownerOf(file, layout))).toEqual([
      "steps",
      "steps",
      "test",
      "code",
      "code",
    ]);
  });

  test("isTestFile is whether the file is under the unit tests' paths", () => {
    expect(["tests/unit/a.test.ts", "tests/steps/a.steps.ts"].map((file) => isTestFile(file, layout))).toEqual([true, false]);
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

describe("judgeBoundary", () => {
  test("accepts a diff inside the attempt's boundary with no forbidden line", () => {
    expect(judgeBoundary("test", { files: ["tests/greet.test.ts"], added: [{ file: "tests/greet.test.ts", text: 'test("greets", () => {' }] })).toBeUndefined();
  });

  test("refuses a diff that writes outside the boundary, naming the files", () => {
    const refusal = judgeBoundary("code", { files: ["src/greet.ts", "package.json"], added: [] });

    expect(refusal?.evidence).toContain("package.json");
    expect(refusal?.evidence).not.toContain("src/greet.ts");
  });

  test("refuses a diff that adds a forbidden line, naming the pattern and its file", () => {
    const refusal = judgeBoundary("test", { files: ["tests/greet.test.ts"], added: [{ file: "tests/greet.test.ts", text: 'test.only("greets", () => {' }] });

    expect(refusal?.evidence).toContain("tests/greet.test.ts");
    expect(refusal?.evidence).toContain(".only");
  });
});

describe("ownerOf", () => {
  test("the attempt kind that writes a file owns it", () => {
    expect(["features/steps/greet.steps.ts", "features/support/world.ts", "tests/greet.test.ts", "src/greet.ts"].map((file) => ownerOf(file))).toEqual(["steps", "steps", "test", "code"]);
  });

  test("a file no kind writes goes to a code attempt: the cause of its error is almost always in the source", () => {
    expect(["scripts/build.ts", "vitest.config.ts", "features/greet-01.feature"].map((file) => ownerOf(file))).toEqual(["code", "code", "code"]);
  });
});

describe("the refactor-code kind (FR-REF-02)", () => {
  test("a cleanup attempt may write source only: tests, step definitions and feature files stay fixed", () => {
    expect(outsideBoundary("refactor-code", ["src/greet.ts", "src/name-check.ts", "tests/greet.test.ts", "features/steps/greet.steps.ts", "features/greet-01.feature"])).toEqual([
      "tests/greet.test.ts",
      "features/steps/greet.steps.ts",
      "features/greet-01.feature",
    ]);
  });

  test("a cleanup attempt writes under every path the project gives the source", () => {
    const layout: Layout = {
      spec: "SPEC.md",
      features: "features/",
      writable: { steps: ["features/steps/"], test: ["tests/"], code: ["src/", "shared/"] },
    };
    expect(outsideBoundary("refactor-code", ["src/greet.ts", "shared/names.ts", "tests/greet.test.ts"], layout)).toEqual(["tests/greet.test.ts"]);
  });

  test("judgeBoundary refuses a cleanup diff that edits a unit test, naming the file", () => {
    const refusal = judgeBoundary("refactor-code", { files: ["src/greet.ts", "tests/greet.test.ts"], added: [] });
    expect(refusal).toBeDefined();
    expect(refusal!.evidence).toContain("tests/greet.test.ts");
    expect(refusal!.next).toContain("src/");
  });
});
