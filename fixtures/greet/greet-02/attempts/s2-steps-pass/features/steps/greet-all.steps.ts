import { When } from "@cucumber/cucumber";

interface GreetWorld {
  greeting?: string;
}

When("I greet {string} and {string}", async function (this: GreetWorld, first: string, second: string) {
  const { greetPair } = await import("../../src/greet-all.ts");
  this.greeting = greetPair(first, second);
});

When("I greet {string}, {string} and {string}", function (this: GreetWorld, first: string, second: string, third: string) {
  this.greeting = `Hello, ${first}, ${second} and ${third}!`;
});
