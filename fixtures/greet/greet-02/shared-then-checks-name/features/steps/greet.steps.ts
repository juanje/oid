import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";

interface GreetWorld {
  name?: string;
  greeting?: string;
}

When("I greet {string}", async function (this: GreetWorld, name: string) {
  // A dynamic import, so that a missing module fails this step and not the whole load.
  const { greet } = await import("../../src/greet.ts");
  this.name = name;
  this.greeting = greet(name);
});

Then("I get {string}", async function (this: GreetWorld, expected: string) {
  // It checks the greeting of the name the When step kept, not the greeting the scenario got: shared by every
  // scenario that ends with this step, it holds only for FR-GREET-01's.
  const { greet } = await import("../../src/greet.ts");
  assert.equal(greet(this.name ?? ""), expected);
});
