import { enclosingFunction, type FunctionComplexity, functionComplexities } from "./complexity.ts";
import { cloneRuns, duplicatedLineCount } from "./duplication.ts";

// The two detectors of the FR-scale refactor (FR-REF-01, D-07), on the whole source given the FR's
// diff: a finding that touches no line the FR added or changed is existing debt and does not count.

/** Where a finding, or a related occurrence, sits (DOMAIN.md, Finding). */
export interface FindingPlace {
  file: string;
  range: { start: number; end: number };
}

export interface Finding extends FindingPlace {
  id: string;
  category: "duplication" | "complexity";
  detail: string;
  related?: FindingPlace[];
}

export interface DetectorInput {
  /** The source files as the FR left them, by path. */
  files: Map<string, string>;
  /** The same files at the run's start. */
  baseline: Map<string, string>;
  /** The lines the FR added or changed, by file. */
  added: Map<string, Set<number>>;
  /** The project's complexity limit (`limits.complexity`, 10 when not set). */
  limit: number;
}

function touches(added: Map<string, Set<number>>, place: FindingPlace): boolean {
  const lines = added.get(place.file);
  if (lines === undefined) return false;
  for (let line = place.range.start; line <= place.range.end; line += 1) if (lines.has(line)) return true;
  return false;
}

/** The findings of both detectors on the FR's diff, duplication first, each with its own id. */
export function detectFindings({ files, baseline, added, limit }: DetectorInput): Finding[] {
  return [...duplicationFindings(files, added), ...complexityFindings(files, baseline, added, limit)];
}

/** Runs repeated in the source where at least one occurrence touches the FR's lines: that occurrence is the finding's place. */
function duplicationFindings(files: Map<string, string>, added: Map<string, Set<number>>): Finding[] {
  const findings: Finding[] = [];
  for (const run of cloneRuns(files)) {
    const places = run.places.map(({ file, start, end }) => ({ file, range: { start, end } }));
    const own = places.find((place) => touches(added, place));
    if (own === undefined) continue;
    findings.push({
      id: `dup-${String(findings.length + 1).padStart(4, "0")}`,
      category: "duplication",
      ...own,
      detail: `${run.lines} duplicated lines`,
      related: places.filter((place) => place !== own),
    });
  }
  return findings;
}

/** Functions the FR changed whose complexity is above the limit and above its value at the run's start (0 for a new one). */
function complexityFindings(files: Map<string, string>, baseline: Map<string, string>, added: Map<string, Set<number>>, limit: number): Finding[] {
  const findings: Finding[] = [];
  for (const [file, lines] of added) {
    const text = files.get(file);
    if (text === undefined) continue;
    const before = new Map(functionComplexities(baseline.get(file) ?? "").map((fn) => [fn.name, fn.complexity]));
    for (const fn of functionComplexities(text)) {
      const changed = [...lines].some((line) => fn.start <= line && line <= fn.end);
      const start = before.get(fn.name) ?? 0;
      if (!changed || fn.complexity <= limit || fn.complexity <= start) continue;
      findings.push({
        id: `cx-${String(findings.length + 1).padStart(4, "0")}`,
        category: "complexity",
        file,
        range: { start: fn.start, end: fn.end },
        detail: `the function ${fn.name} has complexity ${fn.complexity}, above the limit ${limit} (was ${start} at the run's start)`,
      });
    }
  }
  return findings;
}

/** The innermost function holding `line` that has a name: an anonymous one is named by the function around it. */
function namedHolder(functions: FunctionComplexity[], line: number): FunctionComplexity | undefined {
  return enclosingFunction(
    functions.filter(({ name }) => name !== "<anonymous>"),
    line,
  );
}

/**
 * What identifies a finding across cleanups, where lines move: its kind and the functions it sits in. A complex
 * function by its file and name; a duplication by the functions that hold its occurrences, however long the repeated
 * run now is, so that a shorter copy left behind is the same finding, still there (FR-REF-02).
 */
export function findingSignature(finding: Finding, files: Map<string, string>): string {
  if (finding.category === "complexity") {
    const functions = functionComplexities(files.get(finding.file) ?? "");
    return `complexity ${finding.file} ${enclosingFunction(functions, finding.range.start)?.name ?? "?"}`;
  }
  const holders = [finding, ...(finding.related ?? [])].map(({ file, range }) => `${file} ${namedHolder(functionComplexities(files.get(file) ?? ""), range.start)?.name ?? "?"}`);
  return `duplication ${[...new Set(holders)].sort().join(", ")}`;
}

/** The measures a cleanup item must not worsen (FR-REF-02): each function's complexity, and the duplicated lines. */
export interface SourceMeasures {
  /** Each function's complexity, by `<file> <name>`; functions sharing a name keep the highest. */
  functions: Map<string, number>;
  duplicatedLines: number;
}

export function sourceMeasures(files: Map<string, string>): SourceMeasures {
  const functions = new Map<string, number>();
  for (const [file, text] of files) {
    for (const fn of functionComplexities(text)) {
      const key = `${file} ${fn.name}`;
      functions.set(key, Math.max(functions.get(key) ?? 0, fn.complexity));
    }
  }
  return { functions, duplicatedLines: duplicatedLineCount(files) };
}

/** What `after` worsens against `before`, one line each: a shared function more complex, or more duplicated lines. */
export function worseMeasures(before: SourceMeasures, after: SourceMeasures): string[] {
  const worse: string[] = [];
  for (const [key, complexity] of after.functions) {
    const was = before.functions.get(key);
    if (was !== undefined && complexity > was) worse.push(`the function ${key.split(" ")[1]} (${key.split(" ")[0]}) has complexity ${complexity}, up from ${was} before the item`);
  }
  if (after.duplicatedLines > before.duplicatedLines) worse.push(`${after.duplicatedLines} duplicated lines, up from ${before.duplicatedLines} before the item`);
  return worse;
}

/** A finding as a cleanup task shows it, each place with its enclosing named function when the file has one. */
export function findingText(finding: Finding, files: Map<string, string>): string {
  const functionsOf = new Map<string, ReturnType<typeof functionComplexities>>();
  const at = ({ file, range }: FindingPlace): string => {
    const functions = functionsOf.get(file) ?? functionComplexities(files.get(file) ?? "");
    functionsOf.set(file, functions);
    const holder = namedHolder(functions, range.start);
    return `${file}:${range.start}-${range.end}${holder === undefined ? "" : ` (${holder.name})`}`;
  };
  const places = [at(finding), ...(finding.related ?? []).map(at)];
  return `${finding.category}: ${places.join(" repeats ")}: ${finding.detail}`;
}
