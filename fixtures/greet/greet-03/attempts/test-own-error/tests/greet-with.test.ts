import { expect, test } from "vitest";
import * as greeting from "../src/greet.ts";

test("greets a person with the chosen salutation", () => {
  // An error of the test's own while the function does not exist: a failure oid cannot classify.
  const greetWith = (greeting as Record<string, unknown>).greetWith;
  if (typeof greetWith !== "function") throw new Error("greetWith is not there yet");
  expect(greetWith("Good morning", "Ada")).toBe("Good morning, Ada!");
});
