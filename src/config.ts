import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_LAYOUT, type Layout } from "./boundaries.ts";
import type { AttemptKind } from "./executor.ts";
import { git } from "./git.ts";
import { filesRunnersLoad } from "./runner-config.ts";

// The project's oid config, written by hand in the skeleton (FR-CLI-02 writes it later).
const CONFIG_FILE = ".oid.json";
const PERSONAL_CONFIG_FILE = "config.json";
const DEFAULT_RETRIES = 2;
const DEFAULT_TURNS = 40;
// Built scenarios have needed at most 2 rounds in the runs so far.
const DEFAULT_ROUNDS = 6;

export interface Limits {
  /** How many times a refused attempt is retried (docs/design.md §2). */
  retries: number;
  /** How many turns an attempt's agent may take (docs/design.md §2, Limits). */
  turns: number;
  /** How many rounds of test and code attempts a scenario may take, however its failure moves (FR-RUN-09). */
  rounds: number;
}

export async function readLimits(dir: string): Promise<Limits> {
  const config = await readConfig(dir);
  const limits = config.limits;
  return { retries: limits?.retries ?? DEFAULT_RETRIES, turns: limits?.turns ?? DEFAULT_TURNS, rounds: limits?.rounds ?? DEFAULT_ROUNDS };
}

/** The project's own files a task reads, when `.oid.json` names them (FR-AGENT-03). */
export interface Paths {
  domain?: string;
  conventions?: string;
}

/** The keys of `paths` in .oid.json that name what an attempt kind writes. */
const KIND_KEYS: Record<AttemptKind, "steps" | "tests" | "code"> = { steps: "steps", test: "tests", code: "code" };

/**
 * Where the project keeps each kind of file, from .oid.json's `paths` and oid's defaults (FR-AGENT-04). Paths of two
 * kinds where one holds the other are a ConfigError: a file there would belong to both.
 */
export async function readLayout(dir: string): Promise<Layout> {
  const { paths } = await readConfig(dir);
  const kinds = Object.keys(KIND_KEYS) as AttemptKind[];
  const writable = Object.fromEntries(kinds.map((kind) => [kind, paths?.[KIND_KEYS[kind]] ?? DEFAULT_LAYOUT.writable[kind]])) as Layout["writable"];
  for (const [index, kind] of kinds.entries()) {
    for (const other of kinds.slice(index + 1)) {
      for (const one of writable[kind]) {
        const held = writable[other].find((path) => path.startsWith(one) || one.startsWith(path));
        if (held === undefined) continue;
        const [outer, inner] = held.startsWith(one) ? [[kind, one], [other, held]] : [[other, held], [kind, one]];
        throw new ConfigError(
          `${CONFIG_FILE}: paths.${KIND_KEYS[outer[0] as AttemptKind]} "${outer[1]}" holds paths.${KIND_KEYS[inner[0] as AttemptKind]} "${inner[1]}": a file there would belong to two kinds of attempt. Give each kind paths of its own.`,
        );
      }
    }
  }
  return { spec: paths?.spec ?? DEFAULT_LAYOUT.spec, features: paths?.features ?? DEFAULT_LAYOUT.features, writable, loaded: await filesRunnersLoad(dir) };
}

export async function readPaths(dir: string): Promise<Paths> {
  const { paths } = await readConfig(dir);
  return { ...(paths?.domain === undefined ? {} : { domain: paths.domain }), ...(paths?.conventions === undefined ? {} : { conventions: paths.conventions }) };
}

/** A configuration oid cannot run with: an error no attempt can fix (exit 2), which names what to change. */
export class ConfigError extends Error {}

/** Where the person's own oid configuration lives (NFR-08): `$OID_CONFIG_DIR`, else `oid` in `$XDG_CONFIG_HOME`, else `.config/oid` in the home. */
export function personalConfigDir(env: { OID_CONFIG_DIR?: string; XDG_CONFIG_HOME?: string; HOME?: string }): string {
  if (env.OID_CONFIG_DIR !== undefined && env.OID_CONFIG_DIR !== "") return env.OID_CONFIG_DIR;
  if (env.XDG_CONFIG_HOME !== undefined && env.XDG_CONFIG_HOME !== "") return join(env.XDG_CONFIG_HOME, "oid");
  return join(env.HOME ?? homedir(), ".config", "oid");
}

/** The personal config's file, in its config dir. */
export function personalConfigFile(configDir: string): string {
  return join(configDir, PERSONAL_CONFIG_FILE);
}

/** The model the person's agents run on, as `<provider>/<model>`, when their personal config names one (FR-AGENT-01). */
export async function readPersonalModel(configDir: string): Promise<string | undefined> {
  const path = personalConfigFile(configDir);
  return existsSync(path) ? (JSON.parse(await readFile(path, "utf8")) as { model?: string }).model : undefined;
}

/** Whether the project's .oid.json, as committed at HEAD, names a model, which is personal (NFR-08). */
export async function projectNamesModel(projectDir: string): Promise<boolean> {
  const committed = await git(projectDir, "show", `HEAD:${CONFIG_FILE}`).catch(() => undefined);
  return committed !== undefined && (JSON.parse(committed) as { model?: unknown }).model !== undefined;
}

/** Whether the working copy's .oid.json has changes HEAD does not: a run reads the project's config from HEAD only (NFR-08). */
export async function uncommittedProjectConfig(projectDir: string): Promise<boolean> {
  return (await git(projectDir, "status", "--porcelain", "--", CONFIG_FILE)) !== "";
}

async function readConfig(dir: string): Promise<{ limits?: Partial<Limits>; paths?: Paths & { spec?: string; features?: string; steps?: string[]; tests?: string[]; code?: string[] } }> {
  const path = join(dir, CONFIG_FILE);
  return existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : {};
}
