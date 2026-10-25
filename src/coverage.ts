import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import v8ToIstanbul from "v8-to-istanbul";

// Coverage of the FR's new branches (FR-GATE-02): what the unit tests and the scenarios took, joined by place in the
// source, and what of the rest the FR's diff added.

interface Position {
  line: number;
  column: number;
}

interface Place {
  start: Position;
  end: Position;
}

/** One file's coverage as istanbul gives it: where each branch and function starts and ends, and how often each ran. */
export interface FileCoverage {
  path: string;
  branchMap: Record<string, { loc: Place; locations?: Place[] }>;
  b: Record<string, number[]>;
  fnMap: Record<string, { name: string; loc: Place }>;
  f: Record<string, number>;
}

export type CoverageReport = Record<string, FileCoverage>;

/** A branch or function no test runs, where it starts in the source. */
export interface Untaken {
  file: string;
  line: number;
  column: number;
  what: string;
}

/** The lines each file's diff added, from `git diff -U0`; a deleted file adds none. */
export function addedLines(diff: string): Map<string, Set<number>> {
  const added = new Map<string, Set<number>>();
  let file: string | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) file = line === "+++ /dev/null" ? undefined : line.slice("+++ b/".length);
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk === null || file === undefined) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    const lines = added.get(file) ?? new Set<number>();
    for (let n = start; n < start + count; n += 1) lines.add(n);
    if (lines.size > 0) added.set(file, lines);
  }
  return added;
}

// vitest's provider reports a file no unit test loaded as a placeholder function and a branch, which stand for it.
const PLACEHOLDER = "(empty-report)";

/** A range of the source with how often it ran: a branch, or a function's body. */
interface Ran extends Place {
  count: number;
  what: string;
  /** A function a transform adds, which is not in the source (such as `__name`). */
  synthetic: boolean;
  /** It stands for the whole file: taken when any part of the file ran elsewhere. */
  whole: boolean;
}

/**
 * What no report took, joined by place. V8 lists only the ranges that ran a different number of times than the range
 * around them, so a side a report took is not in it: what one report leaves untaken counts as taken when, in another
 * report, the smallest range around it ran. Functions a transform adds, which are not in the source, are left out.
 */
export function untaken(reports: CoverageReport[], root: string): Untaken[] {
  const ranges = reports.map((report) => rangesOf(report, root));
  const left = new Map<string, Untaken>();
  ranges.forEach((files, index) => {
    for (const [file, ran] of files) {
      for (const range of ran.filter((candidate) => candidate.count === 0 && !candidate.synthetic)) {
        const takenElsewhere = ranges.some(
          (other, at) => at !== index && (range.whole ? (other.get(file) ?? []).some((ran) => ran.count > 0) : (innermost(other.get(file) ?? [], range)?.count ?? 0) > 0),
        );
        if (takenElsewhere) continue;
        const { line, column } = range.start;
        const key = `${file} ${line}:${column} ${range.what}`;
        if (!left.has(key)) left.set(key, { file, line, column, what: range.what });
      }
    }
  });
  // A function no test calls is also one block no test takes, at the same place: say it once, as the function.
  const items = [...left.values()];
  const functions = new Set(items.filter((item) => item.what.startsWith("the function")).map((item) => `${item.file} ${item.line}:${item.column}`));
  return items
    .filter((item) => item.what.startsWith("the function") || !functions.has(`${item.file} ${item.line}:${item.column}`))
    .sort((one, other) => one.file.localeCompare(other.file) || one.line - other.line || one.column - other.column);
}

/** Every branch and function of a report as a range of its file, by the file's path from `root`. */
function rangesOf(report: CoverageReport, root: string): Map<string, Ran[]> {
  const files = new Map<string, Ran[]>();
  for (const data of Object.values(report)) {
    const file = relative(real(root), real(data.path));
    const whole = Object.values(data.fnMap).some((fn) => fn.name === PLACEHOLDER);
    const ran: Ran[] = [];
    for (const [id, branch] of Object.entries(data.branchMap)) {
      (data.b[id] ?? []).forEach((count, index) => ran.push({ ...(branch.locations?.[index] ?? branch.loc), count, what: "a branch no test takes", synthetic: false, whole }));
    }
    for (const [id, fn] of Object.entries(data.fnMap)) {
      ran.push({ ...fn.loc, count: data.f[id] ?? 0, what: `the function ${fn.name}, which no test calls`, synthetic: fn.name.startsWith("__"), whole });
    }
    files.set(file, [...(files.get(file) ?? []), ...ran]);
  }
  return files;
}

/** The smallest of `ranges` that holds `place`: the range whose count is the place's. */
function innermost(ranges: Ran[], place: Place): Ran | undefined {
  const holding = ranges.filter((range) => !after(range.start, place.start) && !after(place.end, range.end));
  return holding.sort((one, other) => span(one) - span(other))[0];
}

function after(one: Position, other: Position): boolean {
  return one.line > other.line || (one.line === other.line && one.column > other.column);
}

/** A range's size, in lines first and then columns: enough to tell nested ranges apart. */
function span({ start, end }: Place): number {
  return (end.line - start.line) * 1_000_000 + (end.column - start.column);
}

/** What no test runs, on the lines the FR added: earlier work is not the FR's to cover. */
export function uncoveredNew(left: Untaken[], added: Map<string, Set<number>>): Untaken[] {
  return left.filter((item) => added.get(item.file)?.has(item.line) === true);
}

/** The unit tests' coverage: the istanbul report vitest's coverage provider wrote in `dir`, if it wrote one. */
export function unitCoverage(dir: string): CoverageReport | undefined {
  const file = join(dir, "coverage-final.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as CoverageReport) : undefined;
}

/**
 * The scenarios' coverage: the V8 coverage Node wrote in `dir` (NODE_V8_COVERAGE) for the files of the project in
 * `root` under the `sourcePaths`, as the unit side's coverage includes only them, converted to istanbul through the
 * source maps Node recorded (as c8 does: the executed source is rebuilt from their line lengths). Step definitions are
 * left out: their branches are not the code's to cover.
 */
export async function scenarioCoverage(dir: string, root: string, sourcePaths: string[]): Promise<CoverageReport> {
  const report: CoverageReport = {};
  if (!existsSync(dir)) return report;
  const project = real(root);
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".json"))) {
    const v8 = JSON.parse(readFileSync(join(dir, name), "utf8")) as {
      result: { url: string; functions: Parameters<ReturnType<typeof v8ToIstanbul>["applyCoverage"]>[0] }[];
      "source-map-cache"?: Record<string, { lineLengths: number[]; data: object }>;
    };
    for (const script of v8.result) {
      if (!script.url.startsWith("file://")) continue;
      const path = fileURLToPath(script.url);
      const file = relative(project, real(path));
      if (!sourcePaths.some((prefix) => file.startsWith(prefix)) || file.includes("node_modules/")) continue;
      const cached = v8["source-map-cache"]?.[script.url];
      const sources = cached === undefined ? undefined : { source: cached.lineLengths.map((length) => "".padEnd(length, ".")).join("\n"), sourceMap: { sourcemap: cached.data } };
      const converter = v8ToIstanbul(path, 0, sources);
      await converter.load();
      converter.applyCoverage(script.functions);
      Object.assign(report, converter.toIstanbul());
    }
  }
  return report;
}

function real(path: string): string {
  return existsSync(path) ? realpathSync(path) : path;
}

/**
 * Why the project in `dir` cannot measure its unit tests' coverage, if it cannot: vitest's coverage provider is not
 * where vitest would load it from. Found before any attempt, so that no run spends its attempts on a gate that cannot
 * pass (FR-GATE-02).
 */
export function missingCoverageProvider(dir: string): string | undefined {
  const project = createRequire(join(dir, "package.json"));
  try {
    project.resolve("@vitest/coverage-v8");
    return undefined;
  } catch {
    let version = "<your vitest's version>";
    try {
      version = (JSON.parse(readFileSync(project.resolve("vitest/package.json"), "utf8")) as { version: string }).version;
    } catch {}
    return `The gate measures the unit tests' coverage with vitest's provider, @vitest/coverage-v8, which the project does not have: npm install --save-dev --save-exact @vitest/coverage-v8@${version}`;
  }
}
