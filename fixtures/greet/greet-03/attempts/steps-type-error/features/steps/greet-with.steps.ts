import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";

interface SalutationWorld {
  salutation?: string;
  greeting?: string;
}

Given("the salutation is {string}", function (this: SalutationWorld, salutation: string) {
  this.salutation = salutation;
});

When("I greet {string} with it", async function (this: SalutationWorld, name: string) {
  // A dynamic import, so that missing code fails this step and not the whole load.
  const { greetWith } = await import("../../src/greet.ts");
  this.greeting = greetWith(this.salutation!, name);
});

Then("the greeting is {string}", function (this: SalutationWorld, expected: string) {
  // Runs, so no test catches it; the type check does.
  const greeting: number = this.greeting;
  assert.equal(greeting, expected);
});
