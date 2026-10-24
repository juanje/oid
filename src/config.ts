import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The project's oid config, written by hand in the skeleton (FR-CLI-02 writes it later).
const CONFIG_FILE = ".oid.json";
const DEFAULT_RETRIES = 2;
const DEFAULT_TURNS = 40;

export interface Limits {
  /** How many times a refused attempt is retried (docs/design.md §2). */
  retries: number;
  /** How many turns an attempt's agent may take (docs/design.md §2, Limits). */
  turns: number;
}

export async function readLimits(dir: string): Promise<Limits> {
  const path = join(dir, CONFIG_FILE);
  const config = existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : {};
  return { retries: config.limits?.retries ?? DEFAULT_RETRIES, turns: config.limits?.turns ?? DEFAULT_TURNS };
}
