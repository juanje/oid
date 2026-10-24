import assert from "node:assert/strict";
import { test } from "node:test";
import { greetAll } from "../src/greet-all.ts";

// Written with node:test, not vitest: once it loads, vitest finds no test in it.
test("greets two people together", () => {
  assert.equal(greetAll(["Ada", "Grace"]), "Hello, Ada and Grace!");
});
