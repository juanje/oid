import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";

// The World types the greeter by its shape, not by the class in src/.
interface SalutationWorld {
  salutation?: string;
  greeter?: { greetWith(salutation: string, name: string): string };
  greeting?: string;
}

Given("the salutation is {string}", function (this: SalutationWorld, salutation: string) {
  this.salutation = salutation;
});

When("I greet {string} with it", async function (this: SalutationWorld, name: string) {
  const { Greeter } = await import("../../src/greet.ts");
  this.greeter = new Greeter();
  this.greeting = this.greeter.greetWith(this.salutation!, name);
});

Then("the greeting is {string}", function (this: SalutationWorld, expected: string) {
  assert.equal(this.greeting, expected);
});
