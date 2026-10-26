import { describe, expect, test } from "vitest";
import { ConfigError, readLayout, readLimits, personalConfigDir, uncommittedProjectConfig } from "../../src/config.ts";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tempRepo } from "./support/repo.ts";

describe("readLimits", () => {
  test("takes the limits the project's .oid.json sets", async () => {
    const dir = await tempRepo({ ".oid.json": JSON.stringify({ limits: { retries: 1, turns: 3, rounds: 4 } }) });

    expect(await readLimits(dir)).toEqual({ retries: 1, turns: 3, rounds: 4 });
  });

  test("allows 2 retries, 40 turns per attempt and 6 rounds per scenario when the project does not say", async () => {
    const dir = await tempRepo({ ".oid.json": JSON.stringify({ limits: { retries: 1 } }) });
    const none = await tempRepo({ "a.txt": "a\n" });

    expect({ some: await readLimits(dir), none: await readLimits(none) }).toEqual({ some: { retries: 1, turns: 40, rounds: 6 }, none: { retries: 2, turns: 40, rounds: 6 } });
  });
});

describe("readLayout", () => {
  test("puts each kind of file where the project's .oid.json says", async () => {
    const paths = { spec: "specs/SPEC.md", features: "specs/features/", steps: ["tests/steps/", "tests/support/"], tests: ["tests/unit/"], code: ["src/", "shared/"] };
    const dir = await tempRepo({ ".oid.json": JSON.stringify({ paths }) });

    expect(await readLayout(dir)).toMatchObject({
      spec: "specs/SPEC.md",
      features: "specs/features/",
      writable: { steps: ["tests/steps/", "tests/support/"], test: ["tests/unit/"], code: ["src/", "shared/"] },
    });
  });

  test("keeps oid's defaults for what the project does not say", async () => {
    const dir = await tempRepo({ ".oid.json": JSON.stringify({ paths: { code: ["lib/"] } }) });
    const none = await tempRepo({ "a.txt": "a\n" });
    const defaults = { spec: "SPEC.md", features: "features/", writable: { steps: ["features/steps/", "features/support/"], test: ["tests/"], code: ["src/"] } };

    expect(await readLayout(none)).toMatchObject(defaults);
    expect(await readLayout(dir)).toMatchObject({ ...defaults, writable: { ...defaults.writable, code: ["lib/"] } });
  });

  test("refuses paths of two kinds where one holds the other, naming both", async () => {
    const dir = await tempRepo({ ".oid.json": JSON.stringify({ paths: { tests: ["tests/"], steps: ["tests/steps/"] } }) });
    const same = await tempRepo({ ".oid.json": JSON.stringify({ paths: { tests: ["src/"] } }) });

    const error = await readLayout(dir).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toContain('"tests/"');
    expect((error as Error).message).toContain('"tests/steps/"');
    await expect(readLayout(same)).rejects.toThrow(/"src\/"/);
  });

  test("lets the steps sit inside the features' directory, as cucumber-js lays them out", async () => {
    const dir = await tempRepo({ ".oid.json": JSON.stringify({ paths: { features: "specs/", steps: ["specs/steps/"] } }) });

    expect((await readLayout(dir)).writable.steps).toEqual(["specs/steps/"]);
  });
});

describe("personalConfigDir", () => {
  test("is $OID_CONFIG_DIR, else oid in $XDG_CONFIG_HOME, else .config/oid in the home", () => {
    expect(personalConfigDir({ OID_CONFIG_DIR: "/c", XDG_CONFIG_HOME: "/x", HOME: "/h" })).toBe("/c");
    expect(personalConfigDir({ XDG_CONFIG_HOME: "/x", HOME: "/h" })).toBe("/x/oid");
    expect(personalConfigDir({ HOME: "/h" })).toBe("/h/.config/oid");
  });
});

describe("uncommittedProjectConfig", () => {
  test("says whether the working copy's .oid.json differs from HEAD's, or is not committed at all", async () => {
    const committed = await tempRepo({ ".oid.json": "{}\n" });
    expect(await uncommittedProjectConfig(committed)).toBe(false);

    await writeFile(join(committed, ".oid.json"), '{ "limits": { "retries": 0 } }\n');
    expect(await uncommittedProjectConfig(committed)).toBe(true);

    const untracked = await tempRepo({ "a.txt": "a\n" });
    await writeFile(join(untracked, ".oid.json"), "{}\n");
    expect(await uncommittedProjectConfig(untracked)).toBe(true);
  });
});
