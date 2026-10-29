import { expect, test } from "vitest";

test("greets a person by name", async () => {
  // A path held in a variable: the type checker does not see what the module exports.
  const modulePath = "../src/greet.ts";
  const { greet } = await import(modulePath);
  expect(greet("Ada")).toBe("Hello, Ada!");
});
