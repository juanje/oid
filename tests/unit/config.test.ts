import { describe, expect, test } from "vitest";
import { readLimits } from "../../src/config.ts";
import { tempRepo } from "./support/repo.ts";

describe("readLimits", () => {
  test("takes the retries the project's .oid.json sets", async () => {
    const dir = await tempRepo({ ".oid.json": JSON.stringify({ limits: { retries: 1 } }) });

    expect(await readLimits(dir)).toEqual({ retries: 1 });
  });

  test("allows 2 retries when the project has no .oid.json", async () => {
    const dir = await tempRepo({ "a.txt": "a\n" });

    expect(await readLimits(dir)).toEqual({ retries: 2 });
  });
});
