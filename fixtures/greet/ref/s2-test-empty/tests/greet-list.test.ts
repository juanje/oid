import { expect, test } from "vitest";
import { greetAll } from "../src/greet-all.ts";

test("greets three people as a list", () => {
  expect(greetAll(["Ada", "Grace", "Linus"])).toBe("Hello, Ada, Grace and Linus!");
});

test("rejects an empty name", () => {
  expect(() => greetAll(["Ada", ""])).toThrow();
});
