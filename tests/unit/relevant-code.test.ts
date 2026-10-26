import { describe, expect, test } from "vitest";
import { relevantCode } from "../../src/relevant-code.ts";
import { tempRepo } from "./support/repo.ts";

const STEPS = `import { When } from "@cucumber/cucumber";
import { names } from "../support/names.ts";
When("I greet {string}", async function (name: string) {
  const { greet } = await import("../../src/greet.ts");
  this.greeting = greet(names(name));
});
`;
const FILES = {
  "features/steps/greet.steps.ts": STEPS,
  "features/support/names.ts": "export const names = (name: string) => name;\n",
  "src/greet.ts": "export const greet = (name: string) => `Hello, ${name}!`;\n",
  "src/unrelated.ts": "export const other = 1;\n",
  "tests/greet.test.ts": 'import { greet } from "../src/greet.ts";\n',
  "tests/deep/greet-more.test.ts": 'import { greet } from "../../src/greet.ts";\n',
  "tests/unrelated.test.ts": 'import { other } from "../src/unrelated.ts";\n',
};

describe("relevantCode", () => {
  test("gives the step files, the modules they import, static or dynamic, and the unit tests that import those modules, in that order", async () => {
    const dir = await tempRepo(FILES);

    const { files, cut } = await relevantCode(dir, ["features/steps/greet.steps.ts"], 40_000);

    expect(files.map((file) => file.path)).toEqual([
      "features/steps/greet.steps.ts",
      "features/support/names.ts",
      "src/greet.ts",
      "tests/deep/greet-more.test.ts",
      "tests/greet.test.ts",
    ]);
    expect(files[2]!.content).toBe(FILES["src/greet.ts"]);
    expect(cut).toEqual([]);
  });

  test("looks for the unit tests under the paths the project names", async () => {
    const dir = await tempRepo({ ...FILES, "spec/greet.test.ts": 'import { greet } from "../src/greet.ts";\n' });

    const { files } = await relevantCode(dir, ["features/steps/greet.steps.ts"], 40_000, ["spec/"]);

    expect(files.map((file) => file.path)).toEqual(["features/steps/greet.steps.ts", "features/support/names.ts", "src/greet.ts", "spec/greet.test.ts"]);
  });

  test("leaves out the files past the budget, and names them", async () => {
    const dir = await tempRepo(FILES);

    const { files, cut } = await relevantCode(dir, ["features/steps/greet.steps.ts"], STEPS.length + 10);

    expect(files.map((file) => file.path)).toEqual(["features/steps/greet.steps.ts"]);
    expect(cut).toEqual(["features/support/names.ts", "src/greet.ts", "tests/deep/greet-more.test.ts", "tests/greet.test.ts"]);
  });

  test("gives nothing for a scenario with no step files yet", async () => {
    const dir = await tempRepo(FILES);

    expect(await relevantCode(dir, [], 40_000)).toEqual({ files: [], cut: [] });
  });
});
