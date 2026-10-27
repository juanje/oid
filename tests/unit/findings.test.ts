import { describe, expect, test } from "vitest";
import { detectFindings, findingText } from "../../src/findings.ts";

// The detectors run on the FR's diff against the whole source (FR-REF-01): a finding that touches
// no line the FR added or changed is existing debt and does not count.

const checkBlock = (name: string, message: string) =>
  [
    `export function ${name}(raw: string): string {`,
    `  const value = raw.trim();`,
    `  if (value === "") {`,
    `    throw new Error("${message}");`,
    `  }`,
    `  if (value.length > 40) {`,
    `    throw new Error("${message}: too long");`,
    `  }`,
    `  return value;`,
    `}`,
  ].join("\n");

const added = (file: string, lines: number[]) => new Map([[file, new Set(lines)]]);
const allLines = (text: string) => Array.from({ length: text.split("\n").length }, (_, index) => index + 1);

describe("duplication findings", () => {
  const files = new Map([
    ["src/old.ts", checkBlock("checkOld", "old")],
    ["src/new.ts", checkBlock("checkNew", "new")],
  ]);

  test("a copy with one occurrence on the FR's lines is a finding at that occurrence, with the other as related", () => {
    const findings = detectFindings({ files, baseline: new Map([["src/old.ts", checkBlock("checkOld", "old")]]), added: added("src/new.ts", allLines(checkBlock("x", "x"))), limit: 10 });

    expect(findings).toHaveLength(1);
    const found = findings[0]!;
    expect(found.id).toBe("dup-0001");
    expect(found.category).toBe("duplication");
    expect(found.file).toBe("src/new.ts");
    expect(found.range).toEqual({ start: 1, end: 9 });
    expect(found.detail).toContain("7 duplicated lines");
    expect(found.related).toEqual([{ file: "src/old.ts", range: { start: 1, end: 9 } }]);
  });

  test("a copy that was all there before the run, untouched by the FR, is existing debt and no finding", () => {
    expect(detectFindings({ files, baseline: files, added: added("src/other.ts", [1, 2, 3]), limit: 10 })).toEqual([]);
  });
});

const sized = (name: string, decisions: number) =>
  [
    `export function ${name}(a: number): string {`,
    ...Array.from({ length: decisions }, (_, index) => `  if (a === ${index} + ${index}) {\n    return "${"x".repeat(index + 1)}";\n  }`),
    `  return "many";`,
    `}`,
  ].join("\n");

describe("complexity findings", () => {
  test("a new function above the limit is a finding naming the function and both values", () => {
    const text = sized("pickFive", 4);
    const findings = detectFindings({ files: new Map([["src/pick.ts", text]]), baseline: new Map(), added: added("src/pick.ts", allLines(text)), limit: 3 });

    expect(findings).toHaveLength(1);
    const found = findings[0]!;
    expect(found.id).toBe("cx-0001");
    expect(found.category).toBe("complexity");
    expect(found.file).toBe("src/pick.ts");
    expect(found.detail).toContain("pickFive");
    expect(found.detail).toContain("5");
    expect(found.detail).toContain("3");
  });

  test("a function already above the limit, changed without getting more complex, is no finding", () => {
    const before = sized("pickFive", 4);
    const after = before.replace('return "many";', 'return "plenty";');
    const changedLine = after.split("\n").findIndex((line) => line.includes("plenty")) + 1;

    expect(detectFindings({ files: new Map([["src/pick.ts", after]]), baseline: new Map([["src/pick.ts", before]]), added: added("src/pick.ts", [changedLine]), limit: 3 })).toEqual([]);
  });

  test("a function above the limit that the FR did not touch is no finding", () => {
    const text = sized("pickFive", 4);

    expect(detectFindings({ files: new Map([["src/pick.ts", text]]), baseline: new Map(), added: added("src/other.ts", [1]), limit: 3 })).toEqual([]);
  });

  test("a function the FR made more complex, above the limit and above its start, is a finding", () => {
    const before = sized("pickFive", 4);
    const after = sized("pickFive", 5);

    const findings = detectFindings({ files: new Map([["src/pick.ts", after]]), baseline: new Map([["src/pick.ts", before]]), added: added("src/pick.ts", allLines(after)), limit: 3 });
    expect(findings.map(({ category }) => category)).toEqual(["complexity"]);
    expect(findings[0]!.detail).toContain("6");
  });
});

describe("findingText", () => {
  test("shows each place with its enclosing function, so the task names both functions", () => {
    const files = new Map([
      ["src/old.ts", checkBlock("checkOld", "old")],
      ["src/new.ts", checkBlock("checkNew", "new")],
    ]);
    const findings = detectFindings({ files, baseline: new Map(), added: added("src/new.ts", allLines(checkBlock("x", "x"))), limit: 10 });

    expect(findingText(findings[0]!, files)).toBe("duplication: src/new.ts:1-9 (checkNew) repeats src/old.ts:1-9 (checkOld): 7 duplicated lines");
  });

  test("a complexity finding names its function in the detail", () => {
    const text = sized("pickFive", 4);
    const files = new Map([["src/pick.ts", text]]);
    const findings = detectFindings({ files, baseline: new Map(), added: added("src/pick.ts", allLines(text)), limit: 3 });

    expect(findingText(findings[0]!, files)).toContain("complexity: src/pick.ts:");
    expect(findingText(findings[0]!, files)).toContain("the function pickFive has complexity 5, above the limit 3 (was 0 at the run's start)");
  });
});
