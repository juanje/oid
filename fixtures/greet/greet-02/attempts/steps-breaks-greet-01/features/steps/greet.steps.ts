import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";

interface GreetWorld {
  name?: string;
  greeting?: string;
}

When("I greet {string}", function (this: GreetWorld, name: string) {
  // It keeps the name only, so that FR-GREET-01's scenario has no greeting to check.
  this.name = name;
});

Then("I get {string}", function (this: GreetWorld, expected: string) {
  assert.equal(this.greeting, expected);
});
