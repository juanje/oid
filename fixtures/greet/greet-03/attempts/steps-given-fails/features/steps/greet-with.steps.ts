import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";

interface SalutationWorld {
  greeting?: string;
}

Given("the salutation is {string}", async function (salutation: string) {
  // Sets the scenario up with code that does not exist yet.
  const { setSalutation } = await import("../../src/greet.ts");
  setSalutation(salutation);
});

When("I greet {string} with it", async function (this: SalutationWorld, name: string) {
  const { greetWithSalutation } = await import("../../src/greet.ts");
  this.greeting = greetWithSalutation(name);
});

Then("the greeting is {string}", function (this: SalutationWorld, expected: string) {
  assert.equal(this.greeting, expected);
});
