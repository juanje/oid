import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";

interface GreetWorld {
  greeting?: string;
}

When("I greet {string}", async function (this: GreetWorld, name: string) {
  // A dynamic import, so that a missing module fails this step and not the whole load.
  const { greet } = await import("../../src/greet.ts");
  // The greeting goes to a world of the step's own, where the Then step never looks: no code can make it pass.
  const world: GreetWorld = {};
  world.greeting = greet(name);
});

Then("I get {string}", function (this: GreetWorld, expected: string) {
  // Data that changes on every run makes each failure look new.
  assert.equal(this.greeting, expected, `No greeting yet, on run ${Math.random()}`);
});
