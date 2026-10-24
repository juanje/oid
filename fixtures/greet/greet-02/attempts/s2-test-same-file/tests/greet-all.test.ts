import { expect, test } from "vitest";
import { greetAll } from "../src/greet-all.ts";

test("greets two people together", () => {
  expect(greetAll(["Ada", "Grace"])).toBe("Hello, Ada and Grace!");
});

test("greets three people as a list", () => {
  expect(greetAll(["Ada", "Grace", "Linus"])).toBe("Hello, Ada, Grace and Linus!");
});
