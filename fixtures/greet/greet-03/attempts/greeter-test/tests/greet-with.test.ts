import { expect, test } from "vitest";
import { Greeter } from "../src/greet.ts";

test("greets a person with the chosen salutation", () => {
  const greeter = new Greeter();
  expect(greeter.greetWith("Good morning", "Ada")).toBe("Good morning, Ada!");
});
