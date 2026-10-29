import { expect, test } from "vitest";
import { greet, greetFormally } from "../src/greet.ts";

test("refuses to greet an empty name", () => {
  expect(() => greet("")).toThrow();
});

test("greets a person formally", () => {
  expect(greetFormally("Ada")).toBe("Good day, Ada.");
});

test("refuses to greet an empty name formally", () => {
  expect(() => greetFormally("")).toThrow();
});
