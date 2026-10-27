import { expect, test } from "vitest";
import { joinNames } from "../src/join-names.ts";

test("joins nobody", () => {
  expect(joinNames([])).toBe("nobody");
});

test("joins one name alone", () => {
  expect(joinNames(["Ada"])).toBe("only Ada");
});

test("joins two names with and", () => {
  expect(joinNames(["Ada", "Grace"])).toBe("Ada and Grace");
});

test("joins three names as a list", () => {
  expect(joinNames(["Ada", "Grace", "Linus"])).toBe("Ada, Grace and Linus");
});

test("joins four names as a list", () => {
  expect(joinNames(["Ada", "Grace", "Linus", "Barbara"])).toBe("Ada, Grace, Linus and Barbara");
});
