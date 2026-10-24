import { Given, When } from "@cucumber/cucumber";

interface SalutationWorld {
  salutation?: string;
  greeting?: string;
}

Given("the salutation is {string}", function (this: SalutationWorld, salutation: string) {
  this.salutation = salutation;
});

When("I greet {string} with it", async function (this: SalutationWorld, name: string) {
  const { greetWith } = await import("../../src/greet.ts");
  this.greeting = greetWith(this.salutation!, name);
});
