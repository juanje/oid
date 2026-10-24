import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { addedLines, scenarioCoverage, untaken, uncoveredNew } from "../../src/coverage.ts";

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
