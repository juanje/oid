// What a task reads from the project's own texts (FR-AGENT-03, DOMAIN.md: What a task reads from the project).

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
