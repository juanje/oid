import { describe, expect, test } from "vitest";
import { addedLines, untaken, uncoveredNew } from "../../src/coverage.ts";

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
