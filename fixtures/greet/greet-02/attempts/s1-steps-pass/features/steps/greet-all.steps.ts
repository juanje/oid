import { When } from "@cucumber/cucumber";

interface GreetWorld {
  greeting?: string;
}

When("I greet {string} and {string}", function (this: GreetWorld, first: string, second: string) {
  this.greeting = `Hello, ${first} and ${second}!`;
});
