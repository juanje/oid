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
  const config = await readConfig(dir);
  return { retries: config.limits?.retries ?? DEFAULT_RETRIES, turns: config.limits?.turns ?? DEFAULT_TURNS };
}

/** The project's own files a task reads, when `.oid.json` names them (FR-AGENT-03). */
export interface Paths {
  domain?: string;
  conventions?: string;
}

export async function readPaths(dir: string): Promise<Paths> {
  const { paths } = await readConfig(dir);
  return { ...(paths?.domain === undefined ? {} : { domain: paths.domain }), ...(paths?.conventions === undefined ? {} : { conventions: paths.conventions }) };
}

/** A configuration oid cannot run with: an error no attempt can fix (exit 2), which names what to change. */
export class ConfigError extends Error {}

/** The model the project's agents run on, as `<provider>/<model>`, when .oid.json names one (FR-AGENT-01). */
export async function readModel(dir: string): Promise<string | undefined> {
  return (await readConfig(dir)).model;
}

async function readConfig(dir: string): Promise<{ model?: string; limits?: Partial<Limits>; paths?: Paths }> {
  const path = join(dir, CONFIG_FILE);
  return existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : {};
}
