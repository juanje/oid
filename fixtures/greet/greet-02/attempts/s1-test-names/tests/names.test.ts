import { expect, test } from "vitest";
import { listNames } from "../src/names.ts";

test("lists two names with and", () => {
  expect(listNames(["Ada", "Grace"])).toBe("Ada and Grace");
});
