import { describe, expect, test } from "vitest";
import { readLimits } from "../../src/config.ts";
import { tempRepo } from "./support/repo.ts";

describe("readLimits", () => {
  test("takes the limits the project's .oid.json sets", async () => {
    const dir = await tempRepo({ ".oid.json": JSON.stringify({ limits: { retries: 1, turns: 3 } }) });

    expect(await readLimits(dir)).toEqual({ retries: 1, turns: 3 });
  });

  test("allows 2 retries and 40 turns per attempt when the project does not say", async () => {
    const dir = await tempRepo({ ".oid.json": JSON.stringify({ limits: { retries: 1 } }) });
    const none = await tempRepo({ "a.txt": "a\n" });

    expect({ some: await readLimits(dir), none: await readLimits(none) }).toEqual({ some: { retries: 1, turns: 40 }, none: { retries: 2, turns: 40 } });
  });
});
