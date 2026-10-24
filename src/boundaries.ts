import type { AttemptKind } from "./executor.ts";

// What each attempt kind may write (D-05). The one place the paths live: the config of FR-CLI-02 replaces it.
export const WRITABLE: Record<AttemptKind, string[]> = {
  steps: ["features/steps/", "features/support/"],
  test: ["tests/"],
  code: ["src/"],
};

/** The files an attempt of `kind` wrote outside what it may write. Feature files are the contract: no kind writes them. */
export function outsideBoundary(kind: AttemptKind, files: string[]): string[] {
  return files.filter((file) => file.endsWith(".feature") || !WRITABLE[kind].some((path) => file.startsWith(path)));
}

/** Whether `file` is a unit test, by where tests live. */
export function isTestFile(file: string): boolean {
  return WRITABLE.test.some((path) => file.startsWith(path));
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
