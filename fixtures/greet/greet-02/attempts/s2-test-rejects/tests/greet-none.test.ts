import { expect, test } from "vitest";
import { greetAll } from "../src/greet-all.ts";

test("a greeting of no names rejects", async () => {
  await expect(async () => greetAll([])).rejects.toThrow("No one to greet");
});
