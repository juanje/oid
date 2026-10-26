import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ConfigError } from "./config.ts";

// oid reads vitest's reports as the version installed in the project writes them (FR-EVID-01). DOMAIN.md, vitest, says
// what differs between the versions oid has checked: their coverage maps the source differently.

/** The major versions of vitest whose output oid has checked. */
export type VitestDialect = 3 | 5;

const READ: VitestDialect[] = [3, 5];

/** The project's vitest as the major version installed in it; any other, or none, is a ConfigError naming the versions oid reads. */
export function vitestDialect(dir: string): VitestDialect {
  const versions = READ.map((major) => `vitest ${major}`).join(" and ");
  let version: string;
  try {
    version = (JSON.parse(readFileSync(createRequire(join(dir, "package.json")).resolve("vitest/package.json"), "utf8")) as { version: string }).version;
  } catch {
    throw new ConfigError(`The project has no vitest that oid can find: oid reads ${versions}.`);
  }
  const major = Number(version.split(".")[0]);
  const dialect = READ.find((read) => read === major);
  if (dialect === undefined) throw new ConfigError(`The project's vitest is ${version}: oid reads only ${versions}, whose output it has checked.`);
  return dialect;
}
