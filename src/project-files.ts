import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

/** The TypeScript files under `roots` of the project in `dir`, as paths from `dir`, sorted. */
export async function typescriptFilesUnder(dir: string, roots: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const root of roots) {
    if (!existsSync(join(dir, root))) continue;
    for (const entry of await readdir(join(dir, root), { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".ts")) files.push(relative(dir, join(entry.parentPath, entry.name)));
    }
  }
  return files.sort();
}
