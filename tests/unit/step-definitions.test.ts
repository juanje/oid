import { describe, expect, test } from "vitest";
import { definitionSource, stepPatterns } from "../../src/step-definitions.ts";
import { tempRepo } from "./support/repo.ts";

const STEPS = `import { Then, When } from "@cucumber/cucumber";

When("I greet {string}", async function (name: string) {
  const { greet } = await import("../../src/greet.ts");
  this.greeting = greet(name);
});

Then("I get {string}", function (expected: string) {
  assert.equal(this.greeting, expected);
});
`;

describe("definitionSource", () => {
  test("gives the whole call that defines the step on that line", () => {
    expect(definitionSource(STEPS, 3)).toBe(`When("I greet {string}", async function (name: string) {
  const { greet } = await import("../../src/greet.ts");
  this.greeting = greet(name);
})`);
  });

  test("gives nothing when no call starts on that line", () => {
    expect(definitionSource(STEPS, 2)).toBeUndefined();
  });
});

describe("stepPatterns", () => {
  test("gives the pattern of every step definition under the step paths, expressions and regular expressions, by file", async () => {
    const dir = await tempRepo({
      "features/steps/greet.steps.ts": STEPS,
      "features/support/more.ts": 'import { Given } from "@cucumber/cucumber";\nGiven(/^a list of (\\d+) names$/, function () {});\n',
      "src/not-steps.ts": 'When("not a step definition", () => {});\n',
    });

    expect(await stepPatterns(dir)).toEqual([
      "features/steps/greet.steps.ts: I greet {string}",
      "features/steps/greet.steps.ts: I get {string}",
      "features/support/more.ts: /^a list of (\\d+) names$/",
    ]);
  });
});
