import { expect, test } from "vitest";
import { greetList } from "../src/greet-list.ts";

test("greets two people with and", () => {
  expect(greetList(["Ada", "Grace"])).toBe("Hello, Ada and Grace!");
});
