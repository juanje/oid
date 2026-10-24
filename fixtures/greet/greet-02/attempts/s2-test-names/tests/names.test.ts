import { expect, test } from "vitest";
import { listNames } from "../src/names.ts";

test("lists three names with commas and a final and", () => {
  expect(listNames(["Ada", "Grace", "Linus"])).toBe("Ada, Grace and Linus");
});
