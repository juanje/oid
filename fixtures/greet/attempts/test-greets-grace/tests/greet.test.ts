import { expect, test } from "vitest";
import { greet } from "../src/greet.ts";

test("greets a person by name", () => {
  expect(greet("Grace")).toBe("Hello, Grace!");
});
