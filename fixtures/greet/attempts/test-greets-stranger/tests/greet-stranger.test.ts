import { expect, test } from "vitest";
import { greet } from "../src/greet.ts";

test("greets a stranger when the name is empty", () => {
  expect(greet("")).toBe("Hello, stranger!");
});
