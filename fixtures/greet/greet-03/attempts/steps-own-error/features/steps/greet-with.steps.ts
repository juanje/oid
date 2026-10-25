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
  // An error of the steps' own while the function does not exist: a failure oid cannot classify.
  const greeting: Record<string, unknown> = await import("../../src/greet.ts");
  const greetWith = greeting.greetWith;
  if (typeof greetWith !== "function") throw new Error("greetWith is not there yet");
  this.greeting = greetWith(this.salutation!, name);
});

Then("the greeting is {string}", function (this: SalutationWorld, expected: string) {
  assert.equal(this.greeting, expected);
});
