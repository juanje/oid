import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { type CoverageReport, addedLines, scenarioCoverage, untaken, uncoveredNew } from "../../src/coverage.ts";

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,2 +1,3 @@
@@ -5,0 +6,2 @@ export function greet(name: string): string {
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
--- a/src/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
`;

/** One file's coverage, as istanbul gives it: branches and functions, each with where it starts and how often it ran. */
function report(file: string, branches: [line: number, column: number, count: number][], functions: [name: string, line: number, count: number][] = []) {
  const at = (line: number, column: number) => ({ start: { line, column }, end: { line, column: column + 1 } });
  return {
    [file]: {
      path: file,
      branchMap: Object.fromEntries(branches.map(([line, column], id) => [id, { type: "branch", loc: at(line, column), locations: [at(line, column)] }])),
      b: Object.fromEntries(branches.map(([, , count], id) => [id, [count]])),
      fnMap: Object.fromEntries(functions.map(([name, line], id) => [id, { name, decl: at(line, 0), loc: at(line, 0) }])),
      f: Object.fromEntries(functions.map(([, , count], id) => [id, count])),
    },
  };
}

describe("addedLines", () => {
  test("gives the lines each file's diff added, new files whole, and none for a deleted file", () => {
    expect(addedLines(DIFF)).toEqual(new Map([["src/greet.ts", new Set([1, 2, 3, 6, 7])], ["src/new.ts", new Set([1, 2, 3])]]));
  });
});

describe("untaken", () => {
  test("is what no report took, joined by place: a branch one report takes is taken", () => {
    const unit = report("/w/src/greet.ts", [[2, 18, 0], [2, 7, 3]], [["greet", 1, 3], ["farewell", 5, 0]]);
    const scenarios = report("/w/src/greet.ts", [[2, 18, 1]], [["greet", 1, 2], ["farewell", 5, 0], ["__name", 1, 2]]);

    expect(untaken([unit, scenarios], "/w")).toEqual([{ file: "src/greet.ts", line: 5, column: 0, what: "the function farewell, which no test calls" }]);
  });

  test("takes a branch one report leaves untaken when the other ran the smallest range around it, since V8 lists only ranges that ran a different number of times", () => {
    // One line, \`name === "Ada" ? "Hello, Ada!" : \`Hello, \${name}!\`\`: the unit test takes the second side, the scenario the first.
    const range = (line: number, from: number, to: number, endLine = line) => ({ start: { line, column: from }, end: { line: endLine, column: to } });
    const file = (branches: [ReturnType<typeof range>, number][]) => ({
      "/w/src/greet.ts": {
        path: "/w/src/greet.ts",
        branchMap: Object.fromEntries(branches.map(([loc], id) => [id, { loc, locations: [loc] }])),
        b: Object.fromEntries(branches.map(([, count], id) => [id, [count]])),
        fnMap: { 0: { name: "greet", loc: range(1, 7, 1, 4) } },
        f: { 0: 1 },
      },
    });
    const unit = file([[range(1, 7, 1, 4), 1], [range(3, 18, 42), 0]]);
    const scenarios = file([[range(1, 7, 1, 4), 1], [range(3, 26, 60), 0]]);

    expect(untaken([unit, scenarios], "/w")).toEqual([]);
    expect(untaken([unit, file([[range(1, 7, 1, 4), 1], [range(3, 18, 42), 0]])], "/w")).toEqual([{ file: "src/greet.ts", line: 3, column: 18, what: "a branch no test takes" }]);
  });

  test("leaves out the functions a transform adds, which are not in the source", () => {
    expect(untaken([report("/w/src/a.ts", [], [["__name", 1, 0]])], "/w")).toEqual([]);
  });

  test("takes vitest's placeholder for a file no unit test loads as the whole file: taken when another report ran any part of it", () => {
    // The placeholder comes with a branch at its place, as vitest's provider writes it.
    const placeholder = report("/w/src/list.ts", [[1, 0, 0]], [["(empty-report)", 1, 0]]);
    const scenarios = report("/w/src/list.ts", [], [["greetList", 3, 1]]);

    expect(untaken([placeholder, scenarios], "/w")).toEqual([]);
    expect(untaken([placeholder, report("/w/src/other.ts", [], [["other", 1, 1]])], "/w")).toEqual([
      { file: "src/list.ts", line: 1, column: 0, what: "the function (empty-report), which no test calls" },
    ]);
  });
});

describe("untaken, on vitest 5's whole maps", () => {
  // As vitest 5's provider and ast-v8-to-istanbul write them: every function and every side of every branch, with its
  // count, at the places of the syntax tree; an end column can be null, the end of its line (DOMAIN.md, vitest's coverage).
  const place = (line: number, column: number, endLine: number, endColumn: number | null) => ({ start: { line, column }, end: { line: endLine, column: endColumn } });
  const greet = (counts: { greet: number; farewell: number; ternary: [number, number]; guard: [number, number]; farewellIf: [number, number] }) => ({
    "/w/src/greet.ts": {
      path: "/w/src/greet.ts",
      fnMap: {
        0: { name: "greet", decl: place(1, 16, 1, 21), loc: place(1, 44, 4, null) },
        1: { name: "farewell", decl: place(5, 16, 5, 24), loc: place(5, 47, 8, null) },
      },
      f: { 0: counts.greet, 1: counts.farewell },
      branchMap: {
        0: { type: "if", loc: place(2, 2, 2, null), locations: [place(2, 2, 2, null), { start: {}, end: {} }] },
        1: { type: "cond-expr", loc: place(3, 9, 3, null), locations: [place(3, 28, 3, 61), place(3, 61, 3, null)] },
        2: { type: "if", loc: place(6, 2, 6, null), locations: [place(6, 2, 6, null), { start: {}, end: {} }] },
      },
      b: { 0: counts.guard, 1: counts.ternary, 2: counts.farewellIf },
    },
  });

  test("is what no report took at the same place: a side one report takes is taken", () => {
    const unit = greet({ greet: 1, farewell: 0, ternary: [0, 1], guard: [0, 1], farewellIf: [0, 0] });
    const scenarios = greet({ greet: 1, farewell: 0, ternary: [1, 0], guard: [0, 1], farewellIf: [0, 0] });

    expect(untaken([unit, scenarios], "/w", 5)).toEqual([
      { file: "src/greet.ts", line: 2, column: 2, what: "a branch no test takes" },
      { file: "src/greet.ts", line: 5, column: 47, what: "the function farewell, which no test calls" },
    ]);
  });

  test("takes a function one report calls, whatever the other says of it", () => {
    const unit = greet({ greet: 1, farewell: 1, ternary: [1, 1], guard: [1, 1], farewellIf: [1, 1] });
    const scenarios = greet({ greet: 0, farewell: 0, ternary: [0, 0], guard: [0, 0], farewellIf: [0, 0] });

    expect(untaken([unit, scenarios], "/w", 5)).toEqual([]);
  });

  test("says a missing else no test takes at its if", () => {
    const unit = greet({ greet: 1, farewell: 1, ternary: [1, 1], guard: [1, 0], farewellIf: [1, 1] });

    expect(untaken([unit], "/w", 5)).toEqual([{ file: "src/greet.ts", line: 2, column: 2, what: "a branch no test takes" }]);
  });

  test("keeps what one report has of a file the other did not load", () => {
    const unit = greet({ greet: 0, farewell: 0, ternary: [0, 0], guard: [0, 0], farewellIf: [0, 0] });
    const scenarios = report("/w/src/other.ts", [], [["other", 1, 1]]);

    expect(untaken([unit, scenarios], "/w", 5)).toEqual([
      { file: "src/greet.ts", line: 1, column: 44, what: "the function greet, which no test calls" },
      { file: "src/greet.ts", line: 5, column: 47, what: "the function farewell, which no test calls" },
    ]);
  });
});

describe("uncoveredNew", () => {
  test("keeps what no test runs on the lines the FR added, and leaves the rest to earlier work", () => {
    const left = [
      { file: "src/greet.ts", line: 3, column: 18, what: "a branch no test takes" },
      { file: "src/greet.ts", line: 9, column: 2, what: "a branch no test takes" },
      { file: "src/legacy.ts", line: 2, column: 9, what: "a branch no test takes" },
    ];

    expect(uncoveredNew(left, new Map([["src/greet.ts", new Set([1, 2, 3])]]))).toEqual([left[0]]);
  });
});

describe("scenarioCoverage", () => {
  test("keeps only the scripts under the source paths: a step definition's branches are not the code's to cover", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "oid-coverage-")));
    const scripts = ["src/greet.js", "features/steps/greet.steps.js"];
    for (const script of scripts) {
      mkdirSync(join(root, script, ".."), { recursive: true });
      writeFileSync(join(root, script), "export const ok = (x) => (x ? 1 : 2);\n");
    }
    const v8 = join(root, "v8");
    mkdirSync(v8);
    const result = scripts.map((script, id) => ({
      scriptId: String(id),
      url: pathToFileURL(join(root, script)).href,
      functions: [{ functionName: "", isBlockCoverage: true, ranges: [{ startOffset: 0, endOffset: 39, count: 1 }] }],
    }));
    writeFileSync(join(v8, "coverage-1.json"), JSON.stringify({ result }));

    const report = await scenarioCoverage(v8, root, ["src/"]);

    expect(Object.keys(report).map((path) => relative(root, path))).toEqual(["src/greet.js"]);
  });
});

describe("scenarioCoverage on vitest 5", () => {
  const RECORDED = join(import.meta.dirname, "recorded/vitest5-greet");

  /** The recorded project in a new directory, with vitest 5 installed in it, and the recordings' /work made its path. */
  function project(): { root: string; v8: string; unit: CoverageReport } {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "oid-vitest5-")));
    cpSync(join(RECORDED, "src"), join(root, "src"), { recursive: true });
    mkdirSync(join(root, "node_modules"));
    symlinkSync(join(import.meta.dirname, "../../fixtures/vitest5/node_modules/@vitest"), join(root, "node_modules/@vitest"));
    symlinkSync(join(import.meta.dirname, "../../fixtures/vitest5/node_modules/vitest"), join(root, "node_modules/vitest"));
    const v8 = join(root, "v8");
    mkdirSync(v8);
    for (const name of readdirSync(join(RECORDED, "scenario-v8"))) {
      writeFileSync(join(v8, name), readFileSync(join(RECORDED, "scenario-v8", name), "utf8").replaceAll("/work", root));
    }
    const unit = JSON.parse(readFileSync(join(RECORDED, "unit-coverage.json"), "utf8").replaceAll("/work", root)) as CoverageReport;
    return { root, v8, unit };
  }

  const places = (report: CoverageReport) =>
    Object.values(report).map((file) => ({
      functions: Object.values(file.fnMap).map((fn) => fn.loc),
      branches: Object.values(file.branchMap).map((branch) => branch.locations),
    }));

  test("maps the scenarios' coverage at the places vitest 5's provider maps the unit tests', leaving out tsx's helpers", async () => {
    const { root, v8, unit } = project();

    const scenarios = await scenarioCoverage(v8, root, ["src/"], 5);

    expect(places(scenarios)).toEqual(places(unit));
  });

  test("joined with the unit tests', leaves what no test runs: a side the scenario takes is taken", async () => {
    const { root, v8, unit } = project();

    expect(untaken([unit, await scenarioCoverage(v8, root, ["src/"], 5)], root, 5)).toEqual([
      { file: "src/greet.ts", line: 2, column: 2, what: "a branch no test takes" },
      { file: "src/greet.ts", line: 6, column: 47, what: "the function farewell, which no test calls" },
      { file: "src/greet.ts", line: 10, column: 59, what: "the function later, which no test calls" },
    ]);
  });

  test("refuses a source file whose run code the hook did not keep, naming it", async () => {
    const { root, v8 } = project();
    for (const name of readdirSync(v8).filter((file) => file.startsWith("oid-source-"))) rmSync(join(v8, name));

    await expect(scenarioCoverage(v8, root, ["src/"], 5)).rejects.toThrow(/src\/greet\.ts/);
  });
});
