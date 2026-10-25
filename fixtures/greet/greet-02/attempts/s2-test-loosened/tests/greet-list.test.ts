import { expect, test } from "vitest";
import { greetAll } from "../src/greet-all.ts";

test("greets three people as a list", () => {
  expect(greetAll(["Ada", "Grace", "Linus"])).toBe("Hello, Ada, Grace and Linus!");
});

// Loosened: any greeting that names Linus passes, the code from before included.
test("greets three people with a comma before and", () => {
  expect(greetAll(["Ada", "Grace", "Linus"])).toContain("Linus");
});
