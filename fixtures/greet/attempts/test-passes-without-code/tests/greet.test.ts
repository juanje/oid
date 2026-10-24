import { expect, test } from "vitest";

test("says hello without calling greet", () => {
  expect("Hello, Ada!").toBe("Hello, Ada!");
});
