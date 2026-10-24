import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";

interface GreetWorld {
  greeting?: string;
}

When("I greet {string}", async function (this: GreetWorld, name: string) {
  // A dynamic import, so that a missing module fails this step and not the whole load.
  const { greet } = await import("../../src/greet.ts");
  this.greeting = greet(name);
});

Then("I get {string}", function (this: GreetWorld, expected: string) {
  assert.equal(this.greeting, expected);
});
