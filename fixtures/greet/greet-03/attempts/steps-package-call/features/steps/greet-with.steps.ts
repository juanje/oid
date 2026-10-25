import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";

interface SalutationWorld {
  salutation?: string;
  name?: string;
}

Given("the salutation is {string}", function (this: SalutationWorld, salutation: string) {
  this.salutation = salutation;
});

When("I greet {string} with it", function (this: SalutationWorld, name: string) {
  this.name = name;
});

Then("the greeting is {string}", async function (this: SalutationWorld, expected: string) {
  const check = assert;
  // @ts-expect-error: node:assert has no matchs; a typo on the package's object, which no code can add.
  check.matchs(expected, /, /);
  const { greetWith } = await import("../../src/greet.ts");
  assert.equal(greetWith(this.salutation!, this.name!), expected);
});
