import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("greets a person with the chosen salutation", () => {
  expect(readFileSync("greetings/ada.txt", "utf8")).toBe("Good morning, Ada!");
});
