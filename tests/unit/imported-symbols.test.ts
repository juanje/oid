import { symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { importedSymbolExists } from "../../src/imported-symbols.ts";
import { tempRepo } from "./support/repo.ts";

// greet.ts exports greet only; greetWith is the missing export a new test asks for.
const PROJECT = {
  "src/greet.ts": "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n",
  "tests/greet-with.test.ts":
    'import { expect, test } from "vitest";\nimport { greet, greetWith } from "../src/greet.ts";\n\ntest("greets", () => {\n  expect(greetWith("Hi", greet("Ada"))).toBe("");\n});\n',
  "features/steps/greet-with.steps.ts":
    'import { When } from "@cucumber/cucumber";\n\nWhen("I greet {string} with it", async function (name: string) {\n  const { greetWith } = await import("../../src/greet.ts");\n  greetWith("Hi", name);\n});\n',
  // A helper elsewhere in the project with the same name as the missing export.
  "features/steps/salutations.ts": "export function greetWith(salutation: string, name: string): string {\n  return `${salutation}, ${name}!`;\n}\n",
};

describe("importedSymbolExists", () => {
  test("a name a test imports from a module that does not export it is missing, whatever other files declare", async () => {
    const dir = await tempRepo(PROJECT);

    const exists = await importedSymbolExists(dir, "tests/greet-with.test.ts");

    expect({ greetWith: exists("greetWith"), greet: exists("greet") }).toEqual({ greetWith: false, greet: true });
  });

  test("a name a step definition destructures from a dynamic import is judged by that module", async () => {
    const dir = await tempRepo(PROJECT);

    const exists = await importedSymbolExists(dir, "features/steps/greet-with.steps.ts");

    expect(exists("greetWith")).toBe(false);
  });

  test("a name imported from a module that does not exist is missing", async () => {
    const dir = await tempRepo({ "tests/greet-all.test.ts": 'import { greetAll } from "../src/greet-all.ts";\ngreetAll([]);\n' });

    expect((await importedSymbolExists(dir, "tests/greet-all.test.ts"))("greetAll")).toBe(false);
  });

  test("a name imported from a module that re-exports another counts as existing: it may come from there", async () => {
    const dir = await tempRepo({
      "src/index.ts": 'export * from "./greet.ts";\n',
      "src/greet.ts": "export function greet(): string {\n  return '';\n}\n",
      "tests/index.test.ts": 'import { greet } from "../src/index.ts";\ngreet();\n',
    });

    expect((await importedSymbolExists(dir, "tests/index.test.ts"))("greet")).toBe(true);
  });

  test("a name the file does not import from the project counts as existing: oid cannot say it is missing", async () => {
    const dir = await tempRepo(PROJECT);

    expect((await importedSymbolExists(dir, "tests/greet-with.test.ts"))("length")).toBe(true);
  });
});

// The shortener's runs: FR-SHORTEN-02 adds resolve to the Shortener class FR-SHORTEN-01 built.
const SHORTENER = {
  "tsconfig.json": JSON.stringify({
    compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, allowImportingTsExtensions: true, types: ["node"] },
    include: ["src/**/*.ts", "tests/**/*.ts", "features/**/*.ts"],
  }),
  "src/shortener.ts": "export class Shortener {\n  shorten(url: string): string {\n    return url;\n  }\n}\n",
  "tests/shorten-02.test.ts": [
    'import assert from "node:assert/strict";',
    'import { EventEmitter } from "node:events";',
    'import { Shortener } from "../src/shortener.ts";',
    "const resolver = new Shortener();",
    'resolver.resolve("abc");',
    "const cast = new Shortener();",
    '(cast as Shortener & { resolve(code: string): string }).resolve("abc");',
    'assert.matchs("abc", /abc/);',
    "const emitter = new EventEmitter();",
    'emitter.emitt("abc");',
    "const either: Shortener | EventEmitter = Math.random() > 1 ? new Shortener() : new EventEmitter();",
    'either.lookup("abc");',
    "const anything: any = new Shortener();",
    'anything.resolve("abc");',
    "",
  ].join("\n"),
  // The steps type their World by shape, with an optional property, and the World extends cucumber-js's.
  "features/steps/shorten-01.steps.ts": [
    'import { When, type World } from "@cucumber/cucumber";',
    "interface ShortenWorld extends World {",
    "  shortener?: { shorten(url: string): unknown };",
    "}",
    'When("I resolve the code I got", function (this: ShortenWorld) {',
    '  this.shortener.resolve("abc");',
    '  this.attachh("abc");',
    "});",
    "",
  ].join("\n"),
  // A helper in the tests named like the missing member: it is not the source's.
  "tests/support/helpers.ts": "export function resolve(code: string): string {\n  return code;\n}\n",
};

/** The shortener project with oid's packages, so that the compiler finds @types/node and cucumber-js. */
async function shortenerWith(files: Record<string, string> = {}): Promise<string> {
  const dir = await tempRepo({ ...SHORTENER, ...files });
  await symlink(resolve(import.meta.dirname, "../../node_modules"), join(dir, "node_modules"));
  return dir;
}

describe("importedSymbolExists, for a member", () => {
  test("a method no source file declares, on a receiver the project types, is missing: from a test, through a cast, and from a step's World typed by shape", async () => {
    const dir = await shortenerWith();

    const inTest = await importedSymbolExists(dir, "tests/shorten-02.test.ts");
    const inSteps = await importedSymbolExists(dir, "features/steps/shorten-01.steps.ts");

    expect({ local: inTest("resolver.resolve"), cast: inTest("cast.resolve"), world: inSteps("this.shortener.resolve") }).toEqual({ local: false, cast: false, world: false });
  });

  test("a member a source file declares exists, whatever the receiver", async () => {
    const dir = await shortenerWith({ "src/store.ts": "export const store = {\n  resolve(code: string): string {\n    return code;\n  },\n};\n" });

    expect((await importedSymbolExists(dir, "tests/shorten-02.test.ts"))("resolver.resolve")).toBe(true);
  });

  test("a member of a receiver a package types exists for oid: no code can add it", async () => {
    const dir = await shortenerWith();

    const inTest = await importedSymbolExists(dir, "tests/shorten-02.test.ts");
    const inSteps = await importedSymbolExists(dir, "features/steps/shorten-01.steps.ts");

    expect({
      imported: inTest("assert.matchs"),
      local: inTest("emitter.emitt"),
      union: inTest("either.lookup"),
      extended: inSteps("this.attachh"),
      untyped: inTest("anything.resolve"),
      noCall: inTest("resolver.lookup"),
    }).toEqual({ imported: true, local: true, union: true, extended: true, untyped: true, noCall: true });
  });
});
