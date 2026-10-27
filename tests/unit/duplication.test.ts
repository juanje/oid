import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { cloneRuns, duplicatedLineCount, normalisedLines } from "../../src/duplication.ts";
import { checkBlock } from "./support/source-blocks.ts";

// Lines are compared after normalising identifiers and literals (DOMAIN.md, Normalised), so a copy
// with other names or another message counts (FR-REF-01).

describe("normalisedLines", () => {
  const norms = (text: string) => normalisedLines(text).map(({ norm }) => norm);

  test("leaves out blank lines, comments and lines of only brackets and punctuation", () => {
    const text = 'const a = 1;\n\n// a comment\n/* a block\n * inside\n */\n});\n}\nif (a) {\n';
    expect(normalisedLines(text).map(({ line }) => line)).toEqual([1, 9]);
  });

  test("a copy with other identifiers is the same line", () => {
    expect(norms('const trimmed = name.trim();')).toEqual(norms('const cleaned = person.trim();'));
  });

  test("a copy with another message is the same line", () => {
    expect(norms('throw new Error("A greeting needs a name");')).toEqual(norms("throw new Error(`No greeting fits: ${cleaned}`);"));
  });

  test("another number literal is the same line", () => {
    expect(norms("if (trimmed.length > 40) {")).toEqual(norms("if (cleaned.length > 7) {"));
  });

  test("keywords stay apart: an if is not a while", () => {
    expect(norms("if (a) {")).not.toEqual(norms("while (a) {"));
  });

  test("a different shape is a different line", () => {
    expect(norms("const a = b(c);")).not.toEqual(norms('const a = "text";'));
  });

  test("a trailing comment does not tell two copies apart", () => {
    expect(norms("const a = b.trim(); // why")).toEqual(norms("const c = d.trim();"));
  });

  test("indentation does not tell two copies apart", () => {
    expect(norms("    const a = b.trim();")).toEqual(norms("const a = b.trim();"));
  });
});

describe("cloneRuns", () => {
  test("a run of 5 significant lines repeated in another file, with other names and messages, is a clone with both places", () => {
    const files = new Map([
      ["src/one.ts", checkBlock("checkOne", "one")],
      ["src/two.ts", checkBlock("checkTwo", "two")],
    ]);
    const runs = cloneRuns(files);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.lines).toBeGreaterThanOrEqual(5);
    expect(runs[0]!.places).toEqual([
      { file: "src/one.ts", start: 1, end: 9 },
      { file: "src/two.ts", start: 1, end: 9 },
    ]);
  });

  test("a run of 4 significant lines is not a clone", () => {
    const block = (name: string) => [`function ${name}(a: string): string {`, `  const b = a.trim();`, `  const c = b.toUpperCase();`, `  return c;`, `}`].join("\n");
    expect(cloneRuns(new Map([["src/one.ts", block("one")], ["src/two.ts", block("two")]]))).toEqual([]);
  });

  test("two disjoint copies in the same file are a clone", () => {
    const text = [checkBlock("checkOne", "one"), "", checkBlock("checkTwo", "two")].join("\n");
    const runs = cloneRuns(new Map([["src/one.ts", text]]));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.places).toHaveLength(2);
  });

  test("a repeating pattern that only matches itself overlapping is not a clone", () => {
    const lines = ["function sizes(n: number): string {"];
    for (const size of [1, 2, 3, 4]) {
      lines.push(`  if (n === ${size}) {`, `    return "${size}";`, "  }");
    }
    lines.push('  return "many";', "}");
    expect(cloneRuns(new Map([["src/sizes.ts", lines.join("\n")]]))).toEqual([]);
  });

  test("the shortener's repoint repeats shorten's URL validation: one clone, at both functions", () => {
    const text = readFileSync(join(import.meta.dirname, "recorded/shortener/index.ts.txt"), "utf8");
    const runs = cloneRuns(new Map([["src/index.ts", text]]));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.places).toEqual([
      { file: "src/index.ts", start: 17, end: 25 },
      { file: "src/index.ts", start: 97, end: 104 },
    ]);
    expect(runs[0]!.lines).toBe(7);
  });
});

describe("duplicatedLineCount", () => {
  test("counts each significant line covered by a clone once", () => {
    const files = new Map([
      ["src/one.ts", checkBlock("checkOne", "one")],
      ["src/two.ts", checkBlock("checkTwo", "two")],
    ]);
    expect(duplicatedLineCount(files)).toBe(14);
  });

  test("no clone, no duplicated lines", () => {
    expect(duplicatedLineCount(new Map([["src/one.ts", "const a = 1;"]]))).toBe(0);
  });
});
