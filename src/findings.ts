import { enclosingFunction, type FunctionComplexity, functionComplexities } from "./complexity.ts";
import { conditionsOf } from "./conditions.ts";
import { cloneRuns, duplicatedLineCount, LEAST_DUPLICATED_LINES, normalisedLines } from "./duplication.ts";

// The three detectors of the FR-scale refactor (FR-REF-01, D-07), on the whole source given the FR's
// diff: a finding that touches no line the FR added or changed is existing debt and does not count.

// A condition repeated this many times, with at least this many operators and calls, is a rule worth one place.
const LEAST_REPEATED_CONDITIONS = 3;
const LEAST_CONDITION_WEIGHT = 3;
// A near-copy starts with at least this many of a new function's first statements (FR-REF-01): two or three are a
// lookup and its guard, which every function that reads the same store has.
const LEAST_NEAR_COPY_LINES = 4;

/** Where a finding, or a related occurrence, sits (DOMAIN.md, Finding). */
export interface FindingPlace {
  file: string;
  range: { start: number; end: number };
}

export interface Finding extends FindingPlace {
  id: string;
  category: "duplication" | "repeated_condition" | "complexity";
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

/** The findings of the three detectors on the FR's diff, duplication first, each with its own id. */
export function detectFindings({ files, baseline, added, limit }: DetectorInput): Finding[] {
  return [...duplicationFindings(files, added), ...repeatedConditionFindings(files, added), ...complexityFindings(files, baseline, added, limit)];
}

/**
 * Conditions that appear LEAST_REPEATED_CONDITIONS times or more in the source, each with enough operators and calls
 * to be a rule, where at least one touches the FR's lines: that one is the finding's place. A rule copied as one line
 * is invisible to a window of lines.
 */
function repeatedConditionFindings(files: Map<string, string>, added: Map<string, Set<number>>): Finding[] {
  const byRule = new Map<string, FindingPlace[]>();
  for (const [file, text] of files) {
    for (const { norm, start, end } of conditionsOf(text).filter((condition) => condition.weight >= LEAST_CONDITION_WEIGHT)) {
      byRule.set(norm, [...(byRule.get(norm) ?? []), { file, range: { start, end } }]);
    }
  }
  const findings: Finding[] = [];
  for (const [rule, places] of byRule) {
    if (places.length < LEAST_REPEATED_CONDITIONS) continue;
    const sorted = [...places].sort((one, other) => one.file.localeCompare(other.file) || one.range.start - other.range.start);
    const own = sorted.find((place) => touches(added, place));
    if (own === undefined) continue;
    findings.push({
      id: `cond-${String(findings.length + 1).padStart(4, "0")}`,
      category: "repeated_condition",
      ...own,
      detail: `the condition ${rule} is in ${places.length} places`,
      related: sorted.filter((place) => place !== own),
    });
  }
  return findings;
}

/** A place of the source that starts as a function the FR added does, below the duplication threshold (FR-REF-01). */
export interface NearCopy {
  place: FindingPlace;
  name: string;
  /** The new function it resembles. */
  resembles: FindingPlace;
  resemblesName: string;
  /** How many of the new function's first significant lines it starts with. */
  lines: number;
}

/**
 * The named functions whose first statements, normalised, match the start of a named function the FR added, for at
 * least LEAST_NEAR_COPY_LINES lines and fewer than a duplication has. They are not findings: changing them could change
 * behaviour, so they go to the person.
 */
export function nearCopies({ files, baseline, added }: Omit<DetectorInput, "limit">): NearCopy[] {
  const functions = [...files].flatMap(([file, text]) => {
    const lines = normalisedLines(text);
    return functionComplexities(text)
      .filter(({ name }) => name !== "<anonymous>")
      .map((fn) => ({ file, ...fn, body: lines.filter(({ line }) => line > fn.start && line <= fn.end).map(({ norm }) => norm) }));
  });
  const isNew = ({ file, name, start }: (typeof functions)[number]) =>
    added.get(file)?.has(start) === true && !functionComplexities(baseline.get(file) ?? "").some((fn) => fn.name === name);
  const found: NearCopy[] = [];
  for (const added of functions.filter(isNew)) {
    for (const other of functions.filter((fn) => fn !== added)) {
      let lines = 0;
      while (lines < added.body.length && added.body[lines] === other.body[lines]) lines += 1;
      if (lines < LEAST_NEAR_COPY_LINES || lines >= LEAST_DUPLICATED_LINES) continue;
      found.push({
        place: { file: other.file, range: { start: other.start, end: other.end } },
        name: other.name,
        resembles: { file: added.file, range: { start: added.start, end: added.end } },
        resemblesName: added.name,
        lines,
      });
    }
  }
  return found;
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

/** A finding with the source it was found in. */
export interface SeenFinding {
  finding: Finding;
  files: Map<string, string>;
}

/** The functions that hold a finding, as `<file> <name>`: a complex function itself, or each occurrence's named holder. */
function holders({ finding, files }: SeenFinding): string {
  if (finding.category === "complexity") {
    return `${finding.file} ${enclosingFunction(functionComplexities(files.get(finding.file) ?? ""), finding.range.start)?.name ?? "?"}`;
  }
  const names = [finding, ...(finding.related ?? [])].map(({ file, range }) => `${file} ${namedHolder(functionComplexities(files.get(file) ?? ""), range.start)?.name ?? "?"}`);
  return [...new Set(names)].sort().join(", ");
}

/** The normalised significant lines of a finding's places, but those in `skip`. */
function placeLines({ finding, files }: SeenFinding, skip: Map<string, Set<number>> = new Map()): string[] {
  return [finding, ...(finding.related ?? [])].flatMap(({ file, range }) =>
    normalisedLines(files.get(file) ?? "")
      .filter(({ line }) => line >= range.start && line <= range.end && skip.get(file)?.has(line) !== true)
      .map(({ norm }) => norm),
  );
}

/** The condition a repeated-condition finding repeats, normalised. */
function conditionAt({ finding, files }: SeenFinding): string | undefined {
  return conditionsOf(files.get(finding.file) ?? "").find(({ start, end }) => start === finding.range.start && end === finding.range.end)?.norm;
}

/**
 * Whether `later` is `earlier` after a cleanup, where lines move (FR-REF-02): of the same kind in the same functions.
 * A duplication also repeats only lines of the earlier one, apart from those the cleanup wrote (`written`, by file),
 * and at least one of them, so that a shorter copy left behind is still there and another block is another finding;
 * a repeated condition repeats the same condition.
 */
export function sameFinding(earlier: SeenFinding, later: SeenFinding, written: Map<string, Set<number>> = new Map()): boolean {
  if (earlier.finding.category !== later.finding.category || holders(earlier) !== holders(later)) return false;
  if (later.finding.category === "duplication") {
    const before = new Set(placeLines(earlier));
    const kept = placeLines(later, written);
    return kept.length > 0 && kept.every((line) => before.has(line));
  }
  if (later.finding.category === "repeated_condition") return conditionAt(earlier) === conditionAt(later);
  return true;
}

/**
 * Whether `later`, a duplication, repeats fewer lines than `earlier` did: a cleanup that shortens its duplication has
 * made progress, and the shorter copy is a finding of its own (FR-REF-02).
 */
export function isShorter(earlier: SeenFinding, later: SeenFinding): boolean {
  if (earlier.finding.category !== "duplication" || later.finding.category !== "duplication") return false;
  const repeated = ({ finding, files }: SeenFinding) => normalisedLines(files.get(finding.file) ?? "").filter(({ line }) => line >= finding.range.start && line <= finding.range.end).length;
  return repeated(later) < repeated(earlier);
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
  return `${finding.category.replace("_", " ")}: ${places.join(" repeats ")}: ${finding.detail}`;
}
