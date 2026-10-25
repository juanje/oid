import { When } from "@cucumber/cucumber";

interface GreetWorld {
  greeting?: string;
}

When("I greet {string} and {string}", async function (this: GreetWorld, first: string, second: string) {
  // A dynamic import, so that a missing module fails this step and not the whole load.
  const { greetPair } = await import("../../src/greet-all.ts");
  // The greeting goes to a world of the step's own, where the Then step never looks: no code can make it pass.
  const world: GreetWorld = {};
  world.greeting = greetPair(first, second);
});
