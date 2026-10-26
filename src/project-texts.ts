import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readPaths } from "./config.ts";

// What a task reads from the project's own texts (FR-AGENT-03, DOMAIN.md: What a task reads from the project). Never
// AGENTS.md or CLAUDE.md: they hold process instructions for other agents, which contradict oid's procedure.

/** The project's domain and conventions, each from the file .oid.json names, its default file, or the spec's section. */
export async function projectTexts(dir: string, specFile = "SPEC.md"): Promise<{ domain?: string; conventions?: string }> {
  const paths = await readPaths(dir);
  const spec = await readIfThere(dir, specFile);
  const domain = (await readIfThere(dir, paths.domain)) ?? (await readIfThere(dir, "DOMAIN.md")) ?? specSection(spec, "Domain");
  const conventions = (await readIfThere(dir, paths.conventions)) ?? (await readIfThere(dir, "CONVENTIONS.md")) ?? specSection(spec, "Conventions");
  return { ...(domain === undefined ? {} : { domain }), ...(conventions === undefined ? {} : { conventions }) };
}

async function readIfThere(dir: string, file: string | undefined): Promise<string | undefined> {
  if (file === undefined || !existsSync(join(dir, file))) return undefined;
  return (await readFile(join(dir, file), "utf8")).trim();
}

function specSection(spec: string | undefined, title: string): string | undefined {
  return spec === undefined ? undefined : sectionAt(spec, (line) => line.trim() === `## ${title}`);
}

/** An FR's heading and text in the spec, up to the next heading of its level or higher; none when the spec lacks it. */
export function frText(spec: string, fr: string): string | undefined {
  return sectionAt(spec, (line) => line.startsWith(`#### ${fr}:`));
}

/** The lines from the heading `isHeading` finds to the next heading of its level or higher, trimmed. */
function sectionAt(text: string, isHeading: (line: string) => boolean): string | undefined {
  const lines = text.split("\n");
  const start = lines.findIndex(isHeading);
  if (start === -1) return undefined;
  const level = /^#+/.exec(lines[start]!)?.[0].length ?? 0;
  const end = lines.findIndex((line, index) => index > start && (/^#+/.exec(line)?.[0].length ?? Number.POSITIVE_INFINITY) <= level);
  return lines
    .slice(start, end === -1 ? undefined : end)
    .join("\n")
    .trim();
}
