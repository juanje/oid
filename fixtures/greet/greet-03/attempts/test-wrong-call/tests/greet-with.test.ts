import { expect, test } from "vitest";
import { greet } from "../src/greet.ts";

test("greets a person with the chosen salutation", () => {
  // @ts-expect-error: greet returns a string, not a function.
  expect(greet("Ada")("Good morning")).toBe("Good morning, Ada!");
});
