import { expect, test } from "vitest";
import { greetWith } from "../src/greet.ts";

test("greets a person with the chosen salutation", () => {
  expect(greetWith("Good morning", "Ada")).toBe("Good morning, Ada!"
});
