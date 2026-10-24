import { expect, test } from "vitest";
import { greetWith } from "../src/greet.ts";

test("greets a person with the chosen salutation", () => {
  // Runs, so no test catches it; the type check does.
  const expected: number = "Good morning, Ada!";
  expect(greetWith("Good morning", "Ada")).toBe(expected);
});
