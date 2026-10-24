import { readFileSync } from "node:fs";
import { join } from "node:path";

/** oid's version, from its package: what --version prints and what each run's log records. */
export function oidVersion(): string {
  return (JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as { version: string }).version;
}
