import assert from "node:assert/strict";
import { test } from "vitest";
import { greet } from "../src/greet.ts";

test("greets a person with the chosen salutation", () => {
  // vitest renames an imported binding in its message (`default.matchs`): a local keeps the name the source uses.
  const check = assert;
  // @ts-expect-error: node:assert has no matchs; a typo on the package's object, which no code can add.
  check.matchs(greet("Ada"), /Good morning/);
});
