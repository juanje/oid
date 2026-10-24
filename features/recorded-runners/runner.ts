// Stands in for a fixture project's tsc, vitest or cucumber-js (features/support/runners.ts installs it).
// OID_RUNNERS picks what it does:
// - real: runs the real tool;
// - record: runs the real tool and appends its reply to the scenario's recording;
// - replay: checks the request against the next recorded one, then answers with its reply.
// Re-record with: OID_RECORD_RUNNERS=1 NODE_OPTIONS="--import tsx" npx cucumber-js
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface RecordedReply {
  tool: string;
  args: string[];
  exitCode: number;
  output: string;
  report: string | null;
  /** The files the tool wrote in its coverage directory, by name: vitest's istanbul report, or Node's V8 coverage. */
  coverage?: Record<string, string>;
}

const OID_ROOT = resolve(import.meta.dirname, "../..");
const [tool, ...args] = process.argv.slice(2) as [string, ...string[]];
const mode = process.env.OID_RUNNERS ?? "real";
const recording = process.env.OID_RUNNER_RECORDING ?? "";
const state = process.env.OID_RUNNER_STATE ?? "";

// Paths that differ between the recording and the replay: the run's worktree, its git directory, where the
// reports go, and oid's checkout. macOS reaches temporary directories through both /var and /private/var.
const cwd = realpathSync(process.cwd());
const gitDir = (() => {
  const report = reportArg(args);
  return report === undefined ? undefined : dirname(report.path);
})();
const marks: [string, string][] = [
  ...(gitDir === undefined ? [] : bothForms(realpathOr(gitDir)).map((path): [string, string] => [path, "{gitdir}"])),
  ...bothForms(cwd).map((path): [string, string] => [path, "{cwd}"]),
  [OID_ROOT, "{oid}"],
];
const normalize = (text: string): string => marks.reduce((result, [path, mark]) => result.split(path).join(mark), text);
const denormalize = (text: string): string =>
  text.split("{gitdir}").join(gitDir ?? "{gitdir}").split("{cwd}").join(cwd).split("{oid}").join(OID_ROOT);

function bothForms(path: string): string[] {
  return [path, path.replace(/^\/private\//, "/")];
}

function realpathOr(path: string): string {
  return existsSync(path) ? realpathSync(path) : path;
}

/** The report file a request names, if any: vitest's --outputFile or cucumber-js's message formatter. */
function reportArg(argv: string[]): { index: number; prefix: string; path: string } | undefined {
  for (const [index, arg] of argv.entries()) {
    for (const prefix of ["--outputFile=", "message:"]) {
      if (arg.startsWith(prefix)) return { index, prefix, path: arg.slice(prefix.length) };
    }
  }
  return undefined;
}

/** The request as recorded: the report's directory (the worktree's git directory) is the one part that cannot match. */
function normalizedArgs(argv: string[]): string[] {
  const report = reportArg(argv);
  const asked = argv.map((arg, index) => (index === report?.index ? `${report.prefix}{gitdir}/${report.path.split("/").pop()}` : normalize(arg)));
  // Node's coverage is asked for through the environment: it is part of the request all the same.
  const v8 = process.env.NODE_V8_COVERAGE;
  return v8 === undefined || v8 === "" ? asked : [...asked, `NODE_V8_COVERAGE=${normalize(v8)}`];
}

/** Where the tool writes coverage, if it was asked to: vitest's reports directory, or Node's NODE_V8_COVERAGE. */
function coverageDir(argv: string[]): string | undefined {
  const reports = argv.find((arg) => arg.startsWith("--coverage.reportsDirectory="));
  if (reports !== undefined) return reports.slice("--coverage.reportsDirectory=".length);
  const v8 = process.env.NODE_V8_COVERAGE;
  return v8 === undefined || v8 === "" ? undefined : v8;
}

/**
 * The coverage files in `dir`, normalized. Of Node's V8 coverage, only the worktree's own scripts out of node_modules
 * are kept, the only ones oid reads: a whole run's coverage of Node and the packages weighs megabytes.
 */
function coverageFiles(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  if (!existsSync(dir)) return files;
  const own = (url: string) => bothForms(cwd).some((root) => url.includes(root)) && !url.includes("/node_modules/");
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".json"))) {
    const content = JSON.parse(readFileSync(join(dir, name), "utf8"));
    if (Array.isArray(content.result)) {
      content.result = content.result.filter((script: { url: string }) => own(script.url));
      if (content.result.length === 0) continue;
      const maps = content["source-map-cache"] ?? {};
      content["source-map-cache"] = Object.fromEntries(Object.entries(maps).filter(([url]) => own(url)));
    }
    files[name] = normalize(JSON.stringify(content));
  }
  return files;
}

function runReal(capture: boolean): Promise<{ exitCode: number; output: string }> {
  return new Promise((done) => {
    const child = spawn(join(OID_ROOT, "node_modules/.bin", tool), args, {
      env: { ...process.env, NODE_OPTIONS: process.env.OID_NODE_OPTIONS ?? "" },
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("close", (code) => done({ exitCode: code ?? 1, output }));
  });
}

function refuse(message: string): never {
  process.stderr.write(`recorded ${tool}: ${message}\n`);
  process.exit(97);
}

async function main(): Promise<void> {
  if (mode === "real") process.exit((await runReal(false)).exitCode);
  // A request from the person's working copy, or anywhere but a run's worktree, is never answered.
  if (!cwd.includes("/.oid-worktrees/")) refuse(`asked to run in ${cwd}, which is not a run's worktree`);

  if (mode === "record") {
    const { exitCode, output } = await runReal(true);
    const report = reportArg(args);
    const replies: RecordedReply[] = JSON.parse(readFileSync(recording, "utf8"));
    replies.push({
      tool,
      args: normalizedArgs(args),
      exitCode,
      output: normalize(output),
      report: report !== undefined && existsSync(report.path) ? normalize(readFileSync(report.path, "utf8")) : null,
      ...(coverageDir(args) === undefined ? {} : { coverage: coverageFiles(coverageDir(args)!) }),
    });
    writeFileSync(recording, `${JSON.stringify(replies, null, 2)}\n`);
    process.exit(exitCode);
  }

  if (!existsSync(recording)) refuse(`no recording for this scenario (${recording})`);
  const replies: RecordedReply[] = JSON.parse(readFileSync(recording, "utf8"));
  const index = Number(readFileSync(state, "utf8"));
  const reply = replies[index];
  const asked = JSON.stringify([tool, ...normalizedArgs(args)]);
  if (reply === undefined) refuse(`no recorded reply left for ${asked}`);
  const expected = JSON.stringify([reply.tool, ...reply.args]);
  if (asked !== expected) refuse(`expected ${expected}, got ${asked}`);
  writeFileSync(state, String(index + 1));
  const report = reportArg(args);
  if (reply.report !== null && report !== undefined && existsSync(dirname(report.path))) writeFileSync(report.path, denormalize(reply.report));
  const dir = coverageDir(args);
  if (dir !== undefined && reply.coverage !== undefined) {
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(reply.coverage)) writeFileSync(join(dir, name), denormalize(content));
  }
  process.stdout.write(denormalize(reply.output));
  process.exit(reply.exitCode);
}

await main();
