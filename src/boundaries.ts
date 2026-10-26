import { basename } from "node:path";
import type { AttemptKind } from "./executor.ts";
import type { Refusal } from "./refusal.ts";

// What each attempt kind may write (D-05), when the project's .oid.json does not say otherwise.
export const WRITABLE: Record<AttemptKind, string[]> = {
  steps: ["features/steps/", "features/support/"],
  test: ["tests/"],
  code: ["src/"],
};

/** Where a project keeps each kind of file (FR-AGENT-04): the spec and feature files, and what each attempt kind may write. */
export interface Layout {
  spec: string;
  features: string;
  writable: Record<AttemptKind, string[]>;
  /** The files a runner's configuration loads with every test, when it loads any: the gate's configuration, wherever they sit. */
  loaded?: string[];
}

export const DEFAULT_LAYOUT: Layout = { spec: "SPEC.md", features: "features/", writable: WRITABLE, loaded: [] };

// The gate's configuration, by name wherever it sits (DOMAIN.md, Configuration): an agent that can edit it can pass the
// gate by weakening it.
const GATE_CONFIGURATION = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^npm-shrinkwrap\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^bun\.lockb?$/,
  /^tsconfig.*\.json$/,
  /^jsconfig.*\.json$/,
  /^vitest\.config\./,
  /^vitest\.workspace\./,
  /^vite\.config\./,
  /^cucumber\./,
  /^eslint\.config\./,
  /^\.eslintrc/,
  /^prettier\.config\./,
  /^\.prettierrc/,
  /^biome\.jsonc?$/,
  /^\.oid\.json$/,
];

/** oid's own state, which no agent reads or writes (D-05). */
export const STATE_DIR = ".oid/";

/**
 * Whether no kind may write `file`, whatever the paths say: the contract (the spec, a feature file, or any file under
 * the features' directory outside the steps' paths, which cucumber-js may keep there), the gate's configuration, or
 * oid's state.
 */
function unwritable(file: string, layout: Layout): boolean {
  if (file === layout.spec || file.endsWith(".feature") || file.startsWith(STATE_DIR)) return true;
  if (GATE_CONFIGURATION.some((name) => name.test(basename(file))) || layout.loaded?.includes(file) === true) return true;
  return file.startsWith(layout.features) && !layout.writable.steps.some((path) => file.startsWith(path));
}

/** The files an attempt of `kind` wrote outside what it may write, at the project's paths. */
export function outsideBoundary(kind: AttemptKind, files: string[], layout: Layout = DEFAULT_LAYOUT): string[] {
  return files.filter((file) => unwritable(file, layout) || !layout.writable[kind].some((path) => file.startsWith(path)));
}

/**
 * The attempt kind that owns `file`: the one that may write it. No kind writes a feature file or the gate's
 * configuration, so an error in one goes to a code attempt: its cause is almost always in the source (FR-GATE-04).
 */
export function ownerOf(file: string, layout: Layout = DEFAULT_LAYOUT): AttemptKind {
  const kinds = Object.keys(layout.writable) as AttemptKind[];
  return kinds.find((kind) => outsideBoundary(kind, [file], layout).length === 0) ?? "code";
}

/** Whether `file` is a unit test, by where tests live. */
export function isTestFile(file: string, layout: Layout = DEFAULT_LAYOUT): boolean {
  return layout.writable.test.some((path) => file.startsWith(path));
}

export interface AddedLine {
  file: string;
  text: string;
}

export interface ForbiddenLine extends AddedLine {
  pattern: string;
}

// Patterns that let a check pass without the code working (DOMAIN.md, Edge cases).
const FORBIDDEN: { pattern: string; matches: RegExp }[] = [
  { pattern: ".only", matches: /\.only\s*\(/ },
  { pattern: ".skip", matches: /\.skip\s*\(/ },
  { pattern: "process.env.VITEST", matches: /process\.env\.VITEST\b/ },
];

/** The added lines with a forbidden pattern, each with the pattern it has. */
export function forbiddenLines(added: AddedLine[]): ForbiddenLine[] {
  return added.flatMap((line) => FORBIDDEN.filter(({ matches }) => matches.test(line.text)).map(({ pattern }) => ({ ...line, pattern })));
}

/** Refuses an attempt whose diff writes outside its boundary, or adds a line with a forbidden pattern. */
export function judgeBoundary(kind: AttemptKind, diff: { files: string[]; added: AddedLine[] }, layout: Layout = DEFAULT_LAYOUT): Refusal | undefined {
  const outside = outsideBoundary(kind, diff.files, layout);
  if (outside.length > 0) {
    return {
      failed: `The ${kind} attempt wrote outside what it may write`,
      evidence: outside.join("\n"),
      next: `Write only under ${layout.writable[kind].join(", ")}; feature files, ${layout.spec} and the gate's configuration belong to no attempt`,
    };
  }
  const forbidden = forbiddenLines(diff.added);
  if (forbidden.length > 0) {
    return {
      failed: "Added lines would let a check pass without the code working",
      evidence: forbidden.map((line) => `${line.file}: ${line.pattern}: ${line.text.trim()}`).join("\n"),
      next: "Remove these lines: every test runs every time, and the code behaves the same under test as in use",
    };
  }
  return undefined;
}
