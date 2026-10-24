import leftPad from "left-pad";
import { expect, test } from "vitest";
import { greetWith } from "../src/greet.ts";

test("greets a person with the chosen salutation", () => {
  expect(greetWith(leftPad("Good morning", 12), "Ada")).toBe("Good morning, Ada!");
});
