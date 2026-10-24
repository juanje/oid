import { describe, expect, test } from "vitest";
import { definitionSource } from "../../src/step-definitions.ts";

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
