import { describe, expect, test } from "vitest";
import { projectSymbols } from "../../src/project-symbols.ts";
import { tempRepo, writeFiles } from "./support/repo.ts";

describe("projectSymbols", () => {
  test("names what the project's TypeScript declares, not what it only imports nor what its dependencies declare", async () => {
    const dir = await tempRepo({
      ".gitignore": "node_modules\n",
      "src/greet.ts": "export function greet(): string {\n  return '';\n}\nexport const SALUTATION = 'Hi';\nclass Greeter {}\n",
      "tests/greet-with.test.ts": "import { greetWith } from '../src/greet.ts';\ngreetWith();\n",
    });
    await writeFiles(dir, { "src/new.ts": "export function listNames(): string {\n  return '';\n}\n", "node_modules/dep/index.ts": "export function fromDependency() {}\n" });

    const symbols = await projectSymbols(dir);

    expect(Object.fromEntries(["greet", "SALUTATION", "Greeter", "listNames", "greetWith", "fromDependency"].map((name) => [name, symbols.has(name)]))).toEqual({
      greet: true,
      SALUTATION: true,
      Greeter: true,
      listNames: true,
      greetWith: false,
      fromDependency: false,
    });
  });
});
