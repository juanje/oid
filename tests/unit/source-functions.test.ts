import { describe, expect, test } from "vitest";
import { calledFunctions, functionSignatures } from "../../src/source-functions.ts";

// What a cleanup sees of the source besides its finding (FR-REF-02): the functions' signatures, and the bodies of
// those its finding's places call.

const LETTERS = "/** How many letters. */\nexport function lettersIn(name: string): number {\n  return [...name].length;\n}\n";
const GREET = [
  'import { lettersIn } from "./letters.ts";',
  "",
  "export function greet(name: string): string {",
  "  const trimmed = name.trim();",
  "  if (lettersIn(trimmed) > 40) {",
  '    throw new Error("too long");',
  "  }",
  "  return `Hello, ${shout(trimmed)}!`;",
  "}",
  "",
  "const shout = (text: string) => text.toUpperCase();",
  "",
  "export class Greeter {",
  "  hello(name: string): string {",
  "    return greet(name);",
  "  }",
  "}",
].join("\n");
const FILES = new Map([["src/letters.ts", LETTERS], ["src/greet.ts", GREET]]);

describe("functionSignatures", () => {
  test("gives each named function of the source with its parameters and return type as written, by file", () => {
    expect(functionSignatures(FILES)).toEqual([
      "src/letters.ts: lettersIn(name: string): number",
      "src/greet.ts: greet(name: string): string",
      "src/greet.ts: shout(text: string)",
      "src/greet.ts: Greeter.hello(name: string): string",
    ]);
  });
});

describe("calledFunctions", () => {
  test("gives the text of each source function the places call, once, and not the functions they are in", () => {
    const called = calledFunctions(FILES, [{ file: "src/greet.ts", range: { start: 4, end: 7 } }]);

    expect(called).toEqual([{ file: "src/letters.ts", name: "lettersIn", text: "export function lettersIn(name: string): number {\n  return [...name].length;\n}" }]);
  });

  test("gives nothing for calls to what the source does not define", () => {
    expect(calledFunctions(FILES, [{ file: "src/greet.ts", range: { start: 4, end: 4 } }])).toEqual([]);
  });
});
