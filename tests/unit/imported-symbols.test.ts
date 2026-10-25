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
