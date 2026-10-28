import { describe, expect, test } from "vitest";
import { detectFindings, findingSignature, findingText, sourceMeasures, worseMeasures } from "../../src/findings.ts";
import { checkBlock } from "./support/source-blocks.ts";

// The detectors run on the FR's diff against the whole source (FR-REF-01): a finding that touches
// no line the FR added or changed is existing debt and does not count.


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

  test("names a place inside an anonymous function by the named function around it", () => {
    const inner = checkBlock("x", "inner").split("\n").slice(1, -1).map((line) => `    ${line}`);
    const outer = [`export function checkAll(raws: string[]): string[] {`, `  return raws.map((raw) => {`, ...inner, `  });`, `}`].join("\n");
    const files = new Map([
      ["src/old.ts", checkBlock("checkOld", "old")],
      ["src/all.ts", outer],
    ]);
    const findings = detectFindings({ files, baseline: new Map(), added: added("src/all.ts", allLines(outer)), limit: 10 });

    expect(findingText(findings[0]!, files)).toContain("(checkAll)");
    expect(findingText(findings[0]!, files)).not.toContain("<anonymous>");
  });

  test("a complexity finding names its function in the detail", () => {
    const text = sized("pickFive", 4);
    const files = new Map([["src/pick.ts", text]]);
    const findings = detectFindings({ files, baseline: new Map(), added: added("src/pick.ts", allLines(text)), limit: 3 });

    expect(findingText(findings[0]!, files)).toContain("complexity: src/pick.ts:");
    expect(findingText(findings[0]!, files)).toContain("the function pickFive has complexity 5, above the limit 3 (was 0 at the run's start)");
  });
});

describe("findingSignature", () => {
  test("a duplication finding keeps its signature when unrelated lines move it and its message changes", () => {
    const files = new Map([
      ["src/old.ts", checkBlock("checkOld", "old")],
      ["src/new.ts", checkBlock("checkNew", "new")],
    ]);
    const moved = new Map([
      ["src/old.ts", checkBlock("checkOld", "old")],
      ["src/new.ts", `const unrelated = 1;\n${checkBlock("checkNew", "renamed")}`],
    ]);
    const everything = (text: string) => allLines(text);
    const one = detectFindings({ files, baseline: new Map(), added: added("src/new.ts", everything(checkBlock("x", "x"))), limit: 10 })[0]!;
    const other = detectFindings({ files: moved, baseline: new Map(), added: new Map([["src/new.ts", new Set(everything(moved.get("src/new.ts")!))]]), limit: 10 })[0]!;

    expect(findingSignature(one, files)).toBe(findingSignature(other, moved));
  });

  // The check without its first rule: a shorter copy of the same run.
  const shorter = (name: string, message: string) => checkBlock(name, message).replace(/ {2}if \(value === ""\) \{\n.*\n {2}\}\n/, "");
  const duplicationIn = (files: Map<string, string>, file: string) =>
    detectFindings({ files, baseline: new Map(), added: added(file, allLines(files.get(file)!)), limit: 10 }).find(({ category }) => category === "duplication")!;

  test("a duplication finding left shorter in the same functions keeps its signature", () => {
    const files = new Map([
      ["src/old.ts", checkBlock("checkOld", "old")],
      ["src/new.ts", checkBlock("checkNew", "new")],
    ]);
    const shortened = new Map([
      ["src/old.ts", shorter("checkOld", "old")],
      ["src/new.ts", shorter("checkNew", "new")],
    ]);
    const one = duplicationIn(files, "src/new.ts");
    const other = duplicationIn(shortened, "src/new.ts");

    expect(other.detail).not.toBe(one.detail);
    expect(findingSignature(other, shortened)).toBe(findingSignature(one, files));
  });

  test("a duplication finding moved into another function has another signature", () => {
    const files = new Map([
      ["src/old.ts", checkBlock("checkOld", "old")],
      ["src/new.ts", checkBlock("checkNew", "new")],
    ]);
    const moved = new Map([
      ["src/old.ts", checkBlock("checkOld", "old")],
      ["src/new.ts", checkBlock("checkElsewhere", "new")],
    ]);

    expect(findingSignature(duplicationIn(moved, "src/new.ts"), moved)).not.toBe(findingSignature(duplicationIn(files, "src/new.ts"), files));
  });

  test("a complexity finding's signature is its file and function, wherever its lines sit", () => {
    const text = sized("pickFive", 4);
    const moved = `const unrelated = 1;\n${text}`;
    const one = detectFindings({ files: new Map([["src/pick.ts", text]]), baseline: new Map(), added: added("src/pick.ts", allLines(text)), limit: 3 })[0]!;
    const other = detectFindings({ files: new Map([["src/pick.ts", moved]]), baseline: new Map(), added: added("src/pick.ts", allLines(moved)), limit: 3 })[0]!;

    expect(findingSignature(one, new Map([["src/pick.ts", text]]))).toBe(findingSignature(other, new Map([["src/pick.ts", moved]])));
  });
});

describe("sourceMeasures and worseMeasures", () => {
  test("a function more complex than before the item is worse, named with both values", () => {
    const before = sourceMeasures(new Map([["src/pick.ts", sized("pick", 2)]]));
    const after = sourceMeasures(new Map([["src/pick.ts", sized("pick", 3)]]));

    const worse = worseMeasures(before, after);
    expect(worse).toHaveLength(1);
    expect(worse[0]).toContain("pick");
    expect(worse[0]).toContain("3");
    expect(worse[0]).toContain("4");
  });

  test("a new function, and a function simpler than before, are not worse", () => {
    const before = sourceMeasures(new Map([["src/pick.ts", sized("pick", 3)]]));
    const after = sourceMeasures(new Map([["src/pick.ts", `${sized("pick", 2)}\nexport function also(a: number): number {\n  return a > 0 ? a : 0;\n}`]]));

    expect(worseMeasures(before, after)).toEqual([]);
  });

  test("more duplicated lines than before the item are worse", () => {
    const before = sourceMeasures(new Map([["src/one.ts", checkBlock("checkOne", "one")]]));
    const after = sourceMeasures(new Map([["src/one.ts", checkBlock("checkOne", "one")], ["src/two.ts", checkBlock("checkTwo", "two")]]));

    const worse = worseMeasures(before, after);
    expect(worse).toHaveLength(1);
    expect(worse[0]).toContain("duplicated lines");
  });
});
