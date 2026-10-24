import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import v8ToIstanbul from "v8-to-istanbul";

// Coverage of the FR's new branches (FR-GATE-02): what the unit tests and the scenarios took, joined by place in the
// source, and what of the rest the FR's diff added.

interface Place {
  start: { line: number; column: number };
}

/** One file's coverage as istanbul gives it: where each branch and function starts, and how often each ran. */
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

/**
 * What no report took, joined by place: a branch or function counts as run when any report ran it. Functions a
 * transform adds, which are not in the source (such as `__name`), are left out.
 */
export function untaken(reports: CoverageReport[], root: string): Untaken[] {
  const runs = new Map<string, { untaken: Untaken; count: number }>();
  const tally = (key: string, untaken: Untaken, count: number) => {
    const known = runs.get(key);
    runs.set(key, { untaken, count: (known?.count ?? 0) + count });
  };
  for (const report of reports) {
    for (const data of Object.values(report)) {
      const file = relative(real(root), real(data.path));
      for (const [id, branch] of Object.entries(data.branchMap)) {
        (data.b[id] ?? []).forEach((count, index) => {
          const { line, column } = (branch.locations?.[index] ?? branch.loc).start;
          tally(`${file} ${line}:${column} branch`, { file, line, column, what: "a branch no test takes" }, count);
        });
      }
      for (const [id, fn] of Object.entries(data.fnMap)) {
        if (fn.name.startsWith("__")) continue;
        const { line, column } = fn.loc.start;
        tally(`${file} ${line}:${column} function`, { file, line, column, what: `the function ${fn.name}, which no test calls` }, data.f[id] ?? 0);
      }
    }
  }
  const left = [...runs.values()].filter((run) => run.count === 0).map((run) => run.untaken);
  // A function no test calls is also one block no test takes, at the same place: say it once, as the function.
  const functions = new Set(left.filter((item) => item.what.startsWith("the function")).map((item) => `${item.file} ${item.line}:${item.column}`));
  return left
    .filter((item) => item.what.startsWith("the function") || !functions.has(`${item.file} ${item.line}:${item.column}`))
    .sort((one, other) => one.file.localeCompare(other.file) || one.line - other.line || one.column - other.column);
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
 * `root`, out of its node_modules, converted to istanbul through the source maps Node recorded (as c8 does: the
 * executed source is rebuilt from their line lengths).
 */
export async function scenarioCoverage(dir: string, root: string): Promise<CoverageReport> {
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
      if (!real(path).startsWith(`${project}/`) || path.includes("/node_modules/")) continue;
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
