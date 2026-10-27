// Duplication on the source (FR-REF-01): a run of at least 5 significant lines that appears more than
// once, compared after normalising identifiers and literals (DOMAIN.md, Significant line, Normalised).

/** How many significant lines a run must repeat to count as duplication. */
export const LEAST_DUPLICATED_LINES = 5;

/** One place a run of lines sits, as lines of its file. */
export interface ClonePlace {
  file: string;
  start: number;
  end: number;
}

/** One run of significant lines that appears in more than one place. */
export interface CloneRun {
  /** How many significant lines the run has. */
  lines: number;
  /** Where the run appears, in file and line order, never overlapping. */
  places: ClonePlace[];
}

// Words that shape a line rather than name something: normalising them away would make an if a while.
const KEYWORDS = new Set(
  (
    "abstract any as async await bigint boolean break case catch class const continue declare default delete do else enum export extends " +
    "false finally for from function get if implements import in infer instanceof interface is keyof let namespace never new null number " +
    "object of private protected public readonly return set static string super switch symbol this throw true try type typeof undefined " +
    "unknown var void while yield"
  ).split(" "),
);

// Literals first, so that nothing inside them is taken for an identifier; then the trailing comment goes.
const TEMPLATE = /`(?:[^`\\]|\\.)*`/g;
const STRING = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const COMMENT = /\/\/.*$/;
const NUMBER = /\b\d[\w.]*/g;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

function normalise(line: string): string {
  return line
    .replace(TEMPLATE, "⟨s⟩")
    .replace(STRING, "⟨s⟩")
    .replace(COMMENT, "")
    .replace(NUMBER, "⟨n⟩")
    .replace(IDENTIFIER, (word) => (KEYWORDS.has(word) ? word : "⟨id⟩"))
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether a normalised line counts: not blank, a comment, or only brackets and punctuation (DOMAIN.md). */
function significant(norm: string): boolean {
  if (norm === "" || norm.startsWith("//") || norm.startsWith("/*") || norm.startsWith("*")) return false;
  return /[\w⟨]/.test(norm);
}

/** The significant lines of a source text, each with its line number and its normalised form. */
export function normalisedLines(text: string): { line: number; norm: string }[] {
  return text
    .split("\n")
    .map((raw, index) => ({ line: index + 1, norm: normalise(raw) }))
    .filter(({ norm }) => significant(norm));
}

interface Occurrence {
  file: string;
  /** The window's first significant line, as an index into the file's significant lines. */
  at: number;
}

/**
 * The runs of at least LEAST_DUPLICATED_LINES significant lines that appear more than once in `files`,
 * in another file or disjointly in the same one. Each run is maximal: it cannot be extended and stay a copy.
 */
export function cloneRuns(files: Map<string, string>, least: number = LEAST_DUPLICATED_LINES): CloneRun[] {
  const significantOf = new Map([...files].map(([file, text]) => [file, normalisedLines(text)] as const));
  const windows = new Map<string, Occurrence[]>();
  for (const [file, lines] of significantOf) {
    for (let at = 0; at + least <= lines.length; at += 1) {
      const key = lines.slice(at, at + least).map(({ norm }) => norm).join("\n");
      windows.set(key, [...(windows.get(key) ?? []), { file, at }]);
    }
  }
  const norm = (of: Occurrence, index: number) => significantOf.get(of.file)![index]?.norm;
  // A pair starts a run only where it cannot start earlier: extending forward then gives the maximal run once.
  const maximalStart = (one: Occurrence, other: Occurrence) =>
    one.at === 0 || other.at === 0 || norm(one, one.at - 1) !== norm(other, other.at - 1);
  const runs = new Map<string, CloneRun>();
  for (const occurrences of windows.values()) {
    for (const [index, one] of occurrences.entries()) {
      for (const other of occurrences.slice(index + 1)) {
        if (!maximalStart(one, other)) continue;
        let length = least;
        while (norm(one, one.at + length) !== undefined && norm(one, one.at + length) === norm(other, other.at + length)) length += 1;
        const overlap = one.file === other.file && one.at + length > other.at;
        if (overlap) continue;
        const key = significantOf
          .get(one.file)!
          .slice(one.at, one.at + length)
          .map(({ norm }) => norm)
          .join("\n");
        for (const place of [one, other]) {
          const lines = significantOf.get(place.file)!;
          const run = { file: place.file, start: lines[place.at]!.line, end: lines[place.at + length - 1]!.line };
          const found = runs.get(key) ?? { lines: length, places: [] };
          if (!found.places.some((there) => there.file === run.file && there.start === run.start)) found.places.push(run);
          runs.set(key, found);
        }
      }
    }
  }
  return [...runs.values()].map((run) => ({ ...run, places: run.places.sort(byPlace) })).sort((one, other) => byPlace(one.places[0]!, other.places[0]!));
}

function byPlace(one: ClonePlace, other: ClonePlace): number {
  return one.file.localeCompare(other.file) || one.start - other.start;
}

/** How many significant lines of `files` sit inside some clone's place, each counted once. */
export function duplicatedLineCount(files: Map<string, string>): number {
  const covered = new Set<string>();
  const significantOf = new Map([...files].map(([file, text]) => [file, normalisedLines(text)] as const));
  for (const run of cloneRuns(files)) {
    for (const { file, start, end } of run.places) {
      for (const { line } of significantOf.get(file)!.filter(({ line }) => line >= start && line <= end)) covered.add(`${file}:${line}`);
    }
  }
  return covered.size;
}
