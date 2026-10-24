import { describe, expect, test } from "vitest";
import { readLimits, personalConfigDir } from "../../src/config.ts";
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

describe("personalConfigDir", () => {
  test("is $OID_CONFIG_DIR, else oid in $XDG_CONFIG_HOME, else .config/oid in the home", () => {
    expect(personalConfigDir({ OID_CONFIG_DIR: "/c", XDG_CONFIG_HOME: "/x", HOME: "/h" })).toBe("/c");
    expect(personalConfigDir({ XDG_CONFIG_HOME: "/x", HOME: "/h" })).toBe("/x/oid");
    expect(personalConfigDir({ HOME: "/h" })).toBe("/h/.config/oid");
  });
});
