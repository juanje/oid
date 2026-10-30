import { describe, expect, test } from "vitest";
import { detectFindings, findingText, isShorter, nearCopies, sameFinding, sourceMeasures, worseMeasures } from "../../src/findings.ts";
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

describe("sameFinding", () => {
  test("a duplication finding is the same when unrelated lines move it and its message changes", () => {
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

    expect(sameFinding({ finding: one, files }, { finding: other, files: moved })).toBe(true);
  });

  // The check without its first rule: a shorter copy of the same run.
  const shorter = (name: string, message: string) => checkBlock(name, message).replace(/ {2}if \(value === ""\) \{\n.*\n {2}\}\n/, "");
  const duplicationIn = (files: Map<string, string>, file: string) =>
    detectFindings({ files, baseline: new Map(), added: added(file, allLines(files.get(file)!)), limit: 10 }).find(({ category }) => category === "duplication")!;

  test("a duplication finding left shorter in the same functions is the same finding", () => {
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
    expect(sameFinding({ finding: one, files }, { finding: other, files: shortened })).toBe(true);
  });

  test("a duplication left with fewer repeated lines is shorter, and one as long as it was is not", () => {
    const files = new Map([
      ["src/old.ts", checkBlock("checkOld", "old")],
      ["src/new.ts", checkBlock("checkNew", "new")],
    ]);
    const shortened = new Map([
      ["src/old.ts", shorter("checkOld", "old")],
      ["src/new.ts", shorter("checkNew", "new")],
    ]);
    const one = { finding: duplicationIn(files, "src/new.ts"), files };
    const other = { finding: duplicationIn(shortened, "src/new.ts"), files: shortened };

    expect([isShorter(one, other), isShorter(one, one), isShorter(other, one)]).toEqual([true, false, false]);
  });

  test("a duplication finding moved into another function is another finding", () => {
    const files = new Map([
      ["src/old.ts", checkBlock("checkOld", "old")],
      ["src/new.ts", checkBlock("checkNew", "new")],
    ]);
    const moved = new Map([
      ["src/old.ts", checkBlock("checkOld", "old")],
      ["src/new.ts", checkBlock("checkElsewhere", "new")],
    ]);

    expect(sameFinding({ finding: duplicationIn(files, "src/new.ts"), files }, { finding: duplicationIn(moved, "src/new.ts"), files: moved })).toBe(false);
  });

  // A check followed by a second block of another shape; `spare` puts a line between the two in one copy only, so that
  // each block is a run of its own.
  const twoChecks = (name: string, spare: boolean) =>
    [
      `export function ${name}(raw: string): string {`,
      `  const value = raw.trim();`,
      `  if (value === "") {`,
      `    throw new Error("empty");`,
      `  }`,
      `  if (value.length > 40) {`,
      `    throw new Error("too long");`,
      `  }`,
      ...(spare ? [`  let spare = 0;`] : []),
      `  const words = value.split(" ").filter((word) => word !== "");`,
      `  const count = words.length;`,
      `  const first = words[0];`,
      `  if (count > 3) {`,
      "    throw new Error(`too many words from ${first}`);",
      `  }`,
      `  return value;`,
      `}`,
    ].join("\n");

  test("two different blocks repeated between the same functions are two findings", () => {
    const files = new Map([
      ["src/old.ts", twoChecks("checkOld", true)],
      ["src/new.ts", twoChecks("checkNew", false)],
    ]);
    const [first, second, ...rest] = detectFindings({ files, baseline: new Map(), added: added("src/new.ts", allLines(files.get("src/new.ts")!)), limit: 10 });

    expect(rest).toEqual([]);
    expect(sameFinding({ finding: first!, files }, { finding: second!, files })).toBe(false);
    expect(sameFinding({ finding: second!, files }, { finding: first!, files })).toBe(false);
    expect(sameFinding({ finding: first!, files }, { finding: first!, files })).toBe(true);
  });

  // The check with its first rule replaced by a call to a helper that holds it: the remainder a partial cleanup leaves.
  const withCall = (name: string, message: string) => checkBlock(name, message).replace(/ {2}if \(value === ""\) \{\n.*\n {2}\}\n/, "  requireValue(value);\n");
  const callLine = (text: string) => text.split("\n").findIndex((line) => line.includes("requireValue")) + 1;

  test("a shorter copy holding a call the cleanup wrote in place of the lines it removed is the same finding", () => {
    const files = new Map([
      ["src/old.ts", checkBlock("checkOld", "old")],
      ["src/new.ts", checkBlock("checkNew", "new")],
    ]);
    const called = new Map([
      ["src/old.ts", withCall("checkOld", "old")],
      ["src/new.ts", withCall("checkNew", "new")],
    ]);
    const written = new Map([...called].map(([file, text]) => [file, new Set([callLine(text)])]));
    const one = duplicationIn(files, "src/new.ts");
    const other = duplicationIn(called, "src/new.ts");

    expect(sameFinding({ finding: one, files }, { finding: other, files: called }, written)).toBe(true);
  });

  test("a copy whose every line the cleanup wrote is another finding", () => {
    const files = new Map([
      ["src/old.ts", checkBlock("checkOld", "old")],
      ["src/new.ts", checkBlock("checkNew", "new")],
    ]);
    const written = new Map([...files].map(([file, text]) => [file, new Set(allLines(text))]));
    const one = duplicationIn(files, "src/new.ts");

    expect(sameFinding({ finding: one, files }, { finding: one, files }, written)).toBe(false);
  });

  test("a complexity finding is the same in its file and function, wherever its lines sit", () => {
    const text = sized("pickFive", 4);
    const moved = `const unrelated = 1;\n${text}`;
    const one = detectFindings({ files: new Map([["src/pick.ts", text]]), baseline: new Map(), added: added("src/pick.ts", allLines(text)), limit: 3 })[0]!;
    const other = detectFindings({ files: new Map([["src/pick.ts", moved]]), baseline: new Map(), added: added("src/pick.ts", allLines(moved)), limit: 3 })[0]!;

    expect(sameFinding({ finding: one, files: new Map([["src/pick.ts", text]]) }, { finding: other, files: new Map([["src/pick.ts", moved]]) })).toBe(true);
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

describe("repeated condition findings", () => {
  const greet = [
    "export function greet(name: string): string {",
    '  if (name.trim() === "" || name.length > 40) throw new Error("A greeting needs a name");',
    "  return `Hello, ${name}!`;",
    "}",
    "",
    "export function greetFormally(name: string): string {",
    '  if (name.trim() === "" || name.length > 40) throw new Error("A formal greeting needs a name");',
    "  return `Good day, ${name}.`;",
    "}",
  ].join("\n");
  const greetAll = [
    "export function greetAll(names: string[]): string {",
    '  for (const person of names) if (person.trim() === "" || person.length > 40) throw new Error("Nobody to greet");',
    '  return names.join(" and ");',
    "}",
  ].join("\n");

  test("a condition with three or more operators or calls, three times in the source, one on the FR's lines, is a finding with every place", () => {
    const files = new Map([["src/greet.ts", greet], ["src/greet-all.ts", greetAll]]);

    const findings = detectFindings({ files, baseline: new Map([["src/greet.ts", greet]]), added: added("src/greet-all.ts", allLines(greetAll)), limit: 10 });

    expect(findings).toHaveLength(1);
    const found = findings[0]!;
    expect(found.category).toBe("repeated_condition");
    expect({ file: found.file, range: found.range }).toEqual({ file: "src/greet-all.ts", range: { start: 2, end: 2 } });
    expect(found.related).toEqual([{ file: "src/greet.ts", range: { start: 2, end: 2 } }, { file: "src/greet.ts", range: { start: 7, end: 7 } }]);
    expect(findingText(found, files)).toMatch(/^repeated condition: .*\(greetAll\).*\(greet\).*\(greetFormally\)/);
  });

  test("the same rule reached through ?. in one copy and . in another is one condition", () => {
    const one = 'export function a(n?: string) {\n  if (n?.trim() === "" || n?.length > 40) return 1;\n  return 0;\n}';
    const two = 'export function b(n: string) {\n  if (n.trim() === "" || n.length > 40) return 1;\n  return 0;\n}';
    const three = 'export function c(n?: string) {\n  if (n?.trim() === "" || n.length > 40) return 1;\n  return 0;\n}';
    const files = new Map([["src/a.ts", one], ["src/b.ts", two], ["src/c.ts", three]]);

    expect(detectFindings({ files, baseline: new Map(), added: added("src/c.ts", [2]), limit: 10 }).map((finding) => finding.category)).toEqual(["repeated_condition"]);
  });

  test("in a conditional expression or a return, it counts as in an if", () => {
    const one = 'export function a(n: string) {\n  return n.trim() === "" || n.length > 40;\n}';
    const two = 'export function b(n: string) {\n  return n.trim() === "" || n.length > 40 ? "no" : "yes";\n}';
    const three = 'export function c(n: string) {\n  if (n.trim() === "" || n.length > 40) return 1;\n  return 0;\n}';
    const files = new Map([["src/a.ts", one], ["src/b.ts", two], ["src/c.ts", three]]);

    expect(detectFindings({ files, baseline: new Map(), added: added("src/c.ts", [2]), limit: 10 }).map((finding) => finding.category)).toEqual(["repeated_condition"]);
  });

  test("a condition with fewer than three operators or calls, or repeated twice, or with no place on the FR's lines, is no finding", () => {
    const short = greet.replaceAll('name.trim() === "" || name.length > 40', 'name === ""');
    const shortAll = greetAll.replace('person.trim() === "" || person.length > 40', 'person === ""');
    const twice = new Map([["src/greet.ts", greet.split("\n").slice(0, 4).join("\n")], ["src/greet-all.ts", greetAll]]);
    const files = new Map([["src/greet.ts", greet], ["src/greet-all.ts", greetAll]]);

    expect(detectFindings({ files: new Map([["src/greet.ts", short], ["src/greet-all.ts", shortAll]]), baseline: new Map(), added: added("src/greet-all.ts", [2]), limit: 10 })).toEqual([]);
    expect(detectFindings({ files: twice, baseline: new Map(), added: added("src/greet-all.ts", [2]), limit: 10 })).toEqual([]);
    expect(detectFindings({ files, baseline: files, added: added("src/other.ts", [2]), limit: 10 })).toEqual([]);
  });

  test("the same repeated condition in the same functions is the same finding, wherever its lines move", () => {
    const files = new Map([["src/greet.ts", greet], ["src/greet-all.ts", greetAll]]);
    const moved = new Map([["src/greet.ts", `\n\n${greet}`], ["src/greet-all.ts", greetAll]]);
    const [before] = detectFindings({ files, baseline: new Map(), added: added("src/greet-all.ts", [2]), limit: 10 });
    const [after] = detectFindings({ files: moved, baseline: new Map(), added: added("src/greet-all.ts", [2]), limit: 10 });

    expect(sameFinding({ finding: before!, files }, { finding: after!, files: moved })).toBe(true);
  });

  test("another repeated condition in the same functions is another finding", () => {
    const files = new Map([["src/greet.ts", greet], ["src/greet-all.ts", greetAll]]);
    const other = (text: string) => text.replaceAll(/(\w+)\.trim\(\) === "" \|\| \1\.length > 40/g, '$1.trim() === "" || $1.startsWith(" ")');
    const changed = new Map([["src/greet.ts", other(greet)], ["src/greet-all.ts", other(greetAll)]]);
    const [before] = detectFindings({ files, baseline: new Map(), added: added("src/greet-all.ts", [2]), limit: 10 });
    const [after] = detectFindings({ files: changed, baseline: new Map(), added: added("src/greet-all.ts", [2]), limit: 10 });

    expect(after?.category).toBe("repeated_condition");
    expect(sameFinding({ finding: before!, files }, { finding: after!, files: changed })).toBe(false);
  });
});

describe("nearCopies", () => {
  const check = [
    "function checkedName(person: string): string {",
    "  const cleaned = person.trim();",
    "  const length = cleaned.length;",
    '  if (cleaned === "") {',
    '    throw new Error("Nobody to greet");',
    "  }",
    "  return cleaned;",
    "}",
  ].join("\n");
  const greet = [
    "export function greet(name: string): string {",
    "  const trimmed = name.trim();",
    "  const size = trimmed.length;",
    '  if (trimmed === "") {',
    '    throw new Error("No name to greet");',
    "  }",
    "  return size > 20 ? `Hello, ${trimmed.slice(0, 20)}!` : `Hello, ${trimmed}!`;",
    "}",
  ].join("\n");

  test("a place whose first four statements match the start of a function the FR added, below the duplication threshold, is a near-copy of it", () => {
    const files = new Map([["src/greet.ts", greet], ["src/greet-all.ts", check]]);

    expect(nearCopies({ files, baseline: new Map([["src/greet.ts", greet]]), added: added("src/greet-all.ts", allLines(check)) })).toEqual([
      { place: { file: "src/greet.ts", range: { start: 1, end: 8 } }, name: "greet", resembles: { file: "src/greet-all.ts", range: { start: 1, end: 8 } }, resemblesName: "checkedName", lines: 4 },
    ]);
  });

  test("a function that was there at the run's start, or a start of three statements only, is no near-copy", () => {
    const files = new Map([["src/greet.ts", greet], ["src/greet-all.ts", check]]);
    // A lookup and its guard, which many functions share.
    const threeStatements = new Map([["src/greet.ts", greet.replace('    throw new Error("No name to greet");', '    return "Hello!";')], ["src/greet-all.ts", check]]);

    expect(nearCopies({ files, baseline: files, added: added("src/greet-all.ts", [3]) })).toEqual([]);
    expect(nearCopies({ files: threeStatements, baseline: new Map(), added: added("src/greet-all.ts", allLines(check)) })).toEqual([]);
  });
});
