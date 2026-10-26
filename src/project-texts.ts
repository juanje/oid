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

/**
 * An FR's text in the spec, none when the spec lacks it (DOMAIN.md, Requirements in the spec): under its heading of
 * level 3 or 4, up to the next heading of its level or higher; or after its line in bold, up to the next FR's line in
 * bold or the next heading.
 */
export function frText(spec: string, fr: string): string | undefined {
  return sectionAt(spec, (line) => line.startsWith(`### ${fr}:`) || line.startsWith(`#### ${fr}:`)) ?? boldAt(spec, fr);
}

/** Why oid cannot build an FR whose text the spec lacks, naming the forms it reads (FR-AGENT-03). */
export function noFrText(fr: string, specFile: string): string {
  return `${specFile} has no text for ${fr}: oid reads an FR under a heading "### ${fr}: <title>" or "#### ${fr}: <title>", or after a line in bold "**${fr} — <title>**". Give ${fr} its text in one of these forms, or check its id.`;
}

const BOLD_FR = /^\*\*FR-[A-Z][A-Z0-9]*-\d{2,3}[a-z]? — .+\*\*$/;

function boldAt(spec: string, fr: string): string | undefined {
  const lines = spec.split("\n");
  const start = lines.findIndex((line) => BOLD_FR.test(line) && line.startsWith(`**${fr} — `));
  if (start === -1) return undefined;
  const end = lines.findIndex((line, index) => index > start && (BOLD_FR.test(line) || /^#+ /.test(line)));
  return lines
    .slice(start, end === -1 ? undefined : end)
    .join("\n")
    .trim();
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
