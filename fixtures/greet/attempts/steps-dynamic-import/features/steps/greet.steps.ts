import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";

interface GreetWorld {
  greeting?: string;
}

When("I greet {string}", async function (this: GreetWorld, name: string) {
  // A path held in a variable: the type checker does not see what the module exports.
  const modulePath = "../../src/greet.ts";
  const { greet } = await import(modulePath);
  this.greeting = greet(name);
});

Then("I get {string}", function (this: GreetWorld, expected: string) {
  assert.equal(this.greeting, expected);
});
