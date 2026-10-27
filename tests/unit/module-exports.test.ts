import { describe, expect, test } from "vitest";
import { changedExports, exportSignatures } from "../../src/module-exports.ts";
import { tempRepo } from "./support/repo.ts";

// The public API a cleanup must keep (FR-REF-02): each module exports the same names, with the same
// signatures as the type checker prints them.

const GREET = 'export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n';
const PAIR = 'import { greet } from "./greet.ts";\n\nexport function greetPair(first: string, second: string): string {\n  return `${greet(first)} ${greet(second)}`;\n}\n';

describe("exportSignatures", () => {
  test("gives each module's exported names with their signatures, as the type checker prints them", async () => {
    const dir = await tempRepo({ "src/greet.ts": GREET, "src/pair.ts": PAIR });

    const signatures = await exportSignatures(dir, ["src/greet.ts", "src/pair.ts"]);

    expect(signatures.get("src/greet.ts")).toEqual(new Map([["greet", "(name: string) => string"]]));
    expect(signatures.get("src/pair.ts")).toEqual(new Map([["greetPair", "(first: string, second: string) => string"]]));
  });

  test("a module that exports a constant gives its type", async () => {
    const dir = await tempRepo({ "src/limits.ts": "export const LIMIT = 40;\n" });

    expect((await exportSignatures(dir, ["src/limits.ts"])).get("src/limits.ts")).toEqual(new Map([["LIMIT", "40"]]));
  });
});

describe("changedExports", () => {
  const before = new Map([["src/greet.ts", new Map([["greet", "(name: string) => string"]])]]);

  test("the same modules with the same exports change nothing", () => {
    expect(changedExports(before, before)).toEqual([]);
  });

  test("a changed signature names the module and the export, with both signatures", () => {
    const after = new Map([["src/greet.ts", new Map([["greet", "(name: string, cheerful?: boolean | undefined) => string"]])]]);

    const changes = changedExports(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toContain("src/greet.ts");
    expect(changes[0]).toContain("greet");
    expect(changes[0]).toContain("(name: string) => string");
    expect(changes[0]).toContain("cheerful");
  });

  test("a removed or added export in an existing module is a change; a new module is not", () => {
    const after = new Map([
      ["src/greet.ts", new Map([["greetLoudly", "(name: string) => string"]])],
      ["src/name-check.ts", new Map([["checkedName", "(name: string) => string"]])],
    ]);

    const changes = changedExports(before, after);
    expect(changes.join("\n")).toContain("greet");
    expect(changes.join("\n")).toContain("greetLoudly");
    expect(changes.join("\n")).not.toContain("checkedName");
  });

  test("a removed module is a change", () => {
    expect(changedExports(before, new Map()).join("\n")).toContain("src/greet.ts");
  });
});
