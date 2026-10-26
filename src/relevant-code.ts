import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WRITABLE } from "./boundaries.ts";
import { importedModules } from "./imported-symbols.ts";
import { typescriptFilesUnder } from "./project-files.ts";

export interface RelevantCode {
  files: { path: string; content: string }[];
  /** The relevant files left out because they did not fit the budget. */
  cut: string[];
}

/**
 * The code relevant to a scenario, chosen by imports (FR-AGENT-03): the files that define its steps, the project's
 * modules they import, and the unit tests that import those modules, in that order, within `budget` characters.
 */
export async function relevantCode(dir: string, stepFiles: string[], budget: number, testPaths: string[] = WRITABLE.test): Promise<RelevantCode> {
  const modules = new Set<string>();
  for (const file of stepFiles) for (const module of await importedModules(dir, file)) modules.add(module);
  const tests: string[] = [];
  for (const test of await typescriptFilesUnder(dir, testPaths)) {
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
