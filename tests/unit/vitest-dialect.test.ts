import { describe, expect, test } from "vitest";
import { ConfigError } from "../../src/config.ts";
import { vitestDialect } from "../../src/vitest-dialect.ts";
import { tempRepo } from "./support/repo.ts";

const withVitest = (version: string) => tempRepo({ "package.json": "{}\n", "node_modules/vitest/package.json": JSON.stringify({ name: "vitest", version }) });

describe("vitestDialect", () => {
  test("reads the project's vitest as the major version installed in it, 3 or 5", async () => {
    expect([vitestDialect(await withVitest("3.2.7")), vitestDialect(await withVitest("5.0.3"))]).toEqual([3, 5]);
  });

  test("refuses another major version, naming it and the versions oid reads", async () => {
    const dir = await withVitest("4.1.0");

    expect(() => vitestDialect(dir)).toThrow(ConfigError);
    expect(() => vitestDialect(dir)).toThrow(/4\.1\.0.*vitest 3.*vitest 5/);
  });

  test("refuses a project without vitest, naming the versions oid reads", async () => {
    const dir = await tempRepo({ "package.json": "{}\n" });

    expect(() => vitestDialect(dir)).toThrow(/vitest 3.*vitest 5/);
  });
});
