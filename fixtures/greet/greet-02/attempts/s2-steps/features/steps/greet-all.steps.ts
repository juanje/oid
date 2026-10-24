import { When } from "@cucumber/cucumber";

interface GreetWorld {
  greeting?: string;
}

When("I greet {string} and {string}", async function (this: GreetWorld, first: string, second: string) {
  // A dynamic import, so that a missing module fails this step and not the whole load.
  const { greetPair } = await import("../../src/greet-all.ts");
  this.greeting = greetPair(first, second);
});

When("I greet {string}, {string} and {string}", async function (this: GreetWorld, first: string, second: string, third: string) {
  const { greetAll } = await import("../../src/greet-all.ts");
  this.greeting = greetAll([first, second, third]);
});
