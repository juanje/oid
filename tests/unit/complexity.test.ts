import { describe, expect, test } from "vitest";
import { enclosingFunction, functionComplexities } from "../../src/complexity.ts";

// Cyclomatic complexity as DOMAIN.md defines it: 1, plus each if, for, while, do, case, catch,
// &&, ||, ?? and ? : in the function, not counting the functions nested in it.

const complexityOf = (text: string) => functionComplexities(text).map(({ name, complexity }) => [name, complexity]);

describe("functionComplexities", () => {
  test("a function of straight lines has complexity 1", () => {
    expect(complexityOf("function plain(a: string): string {\n  const b = a.trim();\n  return b;\n}")).toEqual([["plain", 1]]);
  });

  test("each decision counts: if, for, while, do, case, catch, &&, ||, ?? and ? :", () => {
    const text = [
      "function busy(a: number, b?: number): number {",
      "  if (a > 0) { a -= 1; }",
      "  for (let i = 0; i < a; i += 1) { b = i; }",
      "  while (a > 10) { a -= 1; }",
      "  do { a += 1; } while (a < 0);",
      "  switch (a) { case 1: break; case 2: break; default: break; }",
      "  try { a += 1; } catch { a = 0; }",
      "  const c = a > 1 && b !== undefined;",
      "  const d = c || a > 2;",
      "  const e = b ?? 0;",
      "  return d ? a + e : a;",
      "}",
    ].join("\n");
    expect(complexityOf(text)).toEqual([["busy", 12]]);
  });

  test("a nested function's decisions are its own, not the outer function's", () => {
    const text = [
      "function outer(names: string[]): string[] {",
      "  const inner = (name: string): string => {",
      "    if (name === '') { return 'x'; }",
      "    return name;",
      "  };",
      "  return names.map(inner);",
      "}",
    ].join("\n");
    expect(complexityOf(text)).toEqual([
      ["outer", 1],
      ["inner", 2],
    ]);
  });

  test("methods are named with their class, and arrow functions by the variable that holds them", () => {
    const text = [
      "export const pick = (a: number): number => (a > 0 ? a : 0);",
      "class Store {",
      "  get(key: string): string | undefined {",
      "    return key === '' ? undefined : key;",
      "  }",
      "}",
    ].join("\n");
    expect(complexityOf(text)).toEqual([
      ["pick", 2],
      ["Store.get", 2],
    ]);
  });

  test("gives each function its first and last line", () => {
    const text = "function one(): number {\n  return 1;\n}\n\nfunction two(): number {\n  return 2;\n}";
    expect(functionComplexities(text).map(({ name, start, end }) => [name, start, end])).toEqual([
      ["one", 1, 3],
      ["two", 5, 7],
    ]);
  });
});

describe("enclosingFunction", () => {
  const text = "function one(): number {\n  return 1;\n}\n\nfunction two(): number {\n  return 2;\n}";

  test("names the function whose lines hold the line", () => {
    expect(enclosingFunction(functionComplexities(text), 2)?.name).toBe("one");
    expect(enclosingFunction(functionComplexities(text), 6)?.name).toBe("two");
  });

  test("a line outside every function has none", () => {
    expect(enclosingFunction(functionComplexities(text), 4)).toBeUndefined();
  });
});
