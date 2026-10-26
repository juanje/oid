import { readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STATE_DIR } from "./boundaries.ts";
import type { Refusal } from "./refusal.ts";

// What keeps an agent's file tools inside the run's worktree and away from secrets and noise (FR-AGENT-05, DOMAIN.md:
// Paths and secrets). Pi's tools accept absolute paths and ~, and the diff check cannot see what an agent read, nor
// what it wrote outside the worktree: every path-like argument is checked before the call runs.

/** Each file tool's arguments that name a path, and those that are globs searched from one. */
const PATH_ARGUMENTS: Record<string, { paths: string[]; globs: string[] }> = {
  read: { paths: ["path"], globs: [] },
  write: { paths: ["path"], globs: [] },
  edit: { paths: ["path"], globs: [] },
  ls: { paths: ["path"], globs: [] },
  find: { paths: ["path"], globs: ["pattern"] },
  grep: { paths: ["path"], globs: ["glob"] },
};

const SECRET_NAMES = new Set([".env", ".npmrc", ".netrc", "auth.json"]);
const SECRET_EXTENSIONS = [".pem", ".key", ".p12", ".pfx"];
const SECRET_DIRECTORY = "secrets";
const NOISE = ".git";
// oid's own state (D-05), the directory boundaries.ts names STATE_DIR.
const STATE = STATE_DIR.replace(/\/$/, "");

/** Why a file tool's call must not run, naming the path and why; none when every path-like argument is allowed. */
export function toolCallRefusal(worktree: string, tool: string, args: Record<string, unknown>): Refusal | undefined {
  const argumentsOf = PATH_ARGUMENTS[tool];
  if (argumentsOf === undefined) return undefined;
  const root = resolveReal(resolve(worktree));
  for (const name of argumentsOf.paths) {
    const asked = args[name];
    if (typeof asked !== "string") continue;
    const why = pathRefusal(root, asked);
    if (why !== undefined) return refusal(tool, asked, why);
  }
  for (const name of argumentsOf.globs) {
    const asked = args[name];
    if (typeof asked !== "string") continue;
    const glob = expand(asked);
    if (isAbsolute(glob) || glob.split("/").includes("..")) return refusal(tool, asked, "it leads outside the run's worktree");
  }
  return undefined;
}

function pathRefusal(root: string, asked: string): string | undefined {
  const wanted = expand(asked);
  const real = resolveReal(isAbsolute(wanted) ? wanted : join(root, wanted));
  const inside = relative(root, real);
  if (inside === ".." || inside.startsWith("../") || isAbsolute(inside)) return `it resolves to ${real}, outside the run's worktree`;
  const named = relative(root, resolve(root, wanted));
  for (const path of new Set([named, inside])) {
    if (isNoise(path)) return `${path} is ${NOISE}, the worktree's link to the repository's history, which no agent reads`;
    if (isState(path)) return `${path} is oid's own state, which no agent reads`;
    if (isSecretShaped(path)) return `${path} is secret-shaped, and no agent reads secrets`;
  }
  return undefined;
}

function refusal(tool: string, asked: string, why: string): Refusal {
  return {
    failed: `The ${tool} call was refused`,
    evidence: `${asked}: ${why}`,
    next: "Work with the project's files in the run's worktree; secrets and .git are never needed",
  };
}

/** A path as Pi's file tools read it: Unicode spaces made plain, a leading @ dropped, ~ and file:// expanded. */
function expand(asked: string): string {
  let path = asked.replace(/[   -   　]/g, " ");
  if (path.startsWith("@")) path = path.slice(1);
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  if (path.startsWith("file://")) return fileURLToPath(path);
  return path;
}

const MAX_SYMLINKS = 40;

/** Resolves an absolute path as the operating system does, one segment at a time: `..` follows a symlink, and a path that does not exist yet keeps its resolved nearest existing ancestor. */
function resolveReal(path: string): string {
  const pending = path.split("/").filter((segment) => segment !== "");
  let current = "/";
  let links = 0;
  for (let segment = pending.shift(); segment !== undefined; segment = pending.shift()) {
    if (segment === "..") current = dirname(current);
    else if (segment !== ".") {
      const next = join(current, segment);
      const target = linkTarget(next);
      if (target === undefined) current = next;
      else {
        links += 1;
        if (links > MAX_SYMLINKS) throw new Error(`Too many symbolic links in ${path}`);
        if (isAbsolute(target)) current = "/";
        pending.unshift(...target.split("/").filter((part) => part !== ""));
      }
    }
  }
  return current;
}

function linkTarget(path: string): string | undefined {
  try {
    return readlinkSync(path);
  } catch {
    return undefined;
  }
}

/** Whether a path in the worktree is secret-shaped by its name (DOMAIN.md, Paths and secrets). */
function isSecretShaped(path: string): boolean {
  const name = basename(path);
  return (
    SECRET_NAMES.has(name) ||
    name.startsWith(".env.") ||
    SECRET_EXTENSIONS.some((extension) => name.endsWith(extension)) ||
    path.split("/").includes(SECRET_DIRECTORY)
  );
}

function isNoise(path: string): boolean {
  return path.split("/")[0] === NOISE;
}

function isState(path: string): boolean {
  return path.split("/")[0] === STATE;
}

/** What ls, find and grep answer, without the lines that name a secret-shaped file or .git; other tools' answers as they are. */
export function withoutHidden(tool: string, text: string): string {
  const pathOf = LINE_PATH[tool];
  if (pathOf === undefined) return text;
  return text
    .split("\n")
    .filter((line) => {
      const path = pathOf(line);
      return path === undefined || !(isNoise(path) || isState(path) || isSecretShaped(path));
    })
    .join("\n");
}

/** The path a line of a listing or search names, as ls, find and grep write it; none for a line that names none. */
const LINE_PATH: Record<string, (line: string) => string | undefined> = {
  ls: (line) => listed(line),
  find: (line) => listed(line),
  grep: (line) => /^(.+?)[:-]\d+[:-] /.exec(line)?.[1],
};

function listed(line: string): string | undefined {
  const path = line.trim().replace(/\/$/, "");
  return path === "" || path.startsWith("[") ? undefined : path;
}
