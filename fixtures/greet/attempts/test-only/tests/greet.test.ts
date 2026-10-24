import { expect, test } from "vitest";
import { greet } from "../src/greet.ts";

test.only("greets a person by name", () => {
  expect(greet("Ada")).toBe("Hello, Ada!");
});
