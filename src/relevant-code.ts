import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { WRITABLE } from "./boundaries.ts";
import { importedModules } from "./imported-symbols.ts";

export interface RelevantCode {
  files: { path: string; content: string }[];
  /** The relevant files left out because they did not fit the budget. */
  cut: string[];
}

/**
 * The code relevant to a scenario, chosen by imports (FR-AGENT-03): the files that define its steps, the project's
 * modules they import, and the unit tests that import those modules, in that order, within `budget` characters.
 */
export async function relevantCode(dir: string, stepFiles: string[], budget: number): Promise<RelevantCode> {
  const modules = new Set<string>();
  for (const file of stepFiles) for (const module of await importedModules(dir, file)) modules.add(module);
  const tests: string[] = [];
  for (const test of await unitTestFiles(dir)) {
    if ((await importedModules(dir, test)).some((module) => modules.has(module))) tests.push(test);
  }
  const relevant: RelevantCode = { files: [], cut: [] };
  let used = 0;
  for (const path of new Set([...stepFiles, ...modules, ...tests])) {
    const content = await readFile(join(dir, path), "utf8");
    if (used + content.length > budget) {
      relevant.cut.push(path);
      continue;
    }
    relevant.files.push({ path, content });
    used += content.length;
  }
  return relevant;
}

/** The TypeScript files where unit tests live, sorted. */
async function unitTestFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const root of WRITABLE.test) {
    if (!existsSync(join(dir, root))) continue;
    const entries = await readdir(join(dir, root), { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".ts")) files.push(relative(dir, join(entry.parentPath, entry.name)));
    }
  }
  return files.sort();
}
