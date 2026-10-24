import { execFileSync } from "node:child_process";
import { cp, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Attempt, AttemptKind, AttemptOutcome, Executor, TryResult, TryTarget } from "../../src/executor.ts";

/** One attempt the scripted executor answers with: the request it expects, and the files that land as its diff. */
export interface PreparedAttempt {
  kind: AttemptKind;
  scenario: string;
  dir: string;
  /** What the attempt checks with try once its files are in place, as an agent would before it ends. */
  tries?: TryTarget[];
  /** The result it ends with through report; null ends it without one. A short default when left out. */
  report?: string | null;
  /** How many turns its agent would take to finish; 1 when left out. */
  turns?: number;
}

/** One call to try, with what it answered. */
export interface Tried {
  kind: AttemptKind;
  target: TryTarget;
  result: TryResult;
}

/** One request the executor answered: what it came with, and the files the worktree held when it came. */
export interface Request {
  kind: AttemptKind;
  refusal: Attempt["refusal"];
  files: string[];
  /** The turns its agent took, and whether the executor ended it at the turn limit before it finished. */
  turns: number;
  stoppedAtLimit: boolean;
  /** The worktree's HEAD when the request came: its history, newest first, and the files it holds. */
  history: string[];
  committed: string[];
}

/** An executor that answers each request with the next prepared attempt, the way an agent's diff would land. */
export class ScriptedExecutor implements Executor {
  asked = 0;
  readonly tried: Tried[] = [];
  readonly requests: Request[] = [];
  readonly #projectDir: string;
  readonly #script: PreparedAttempt[];

  constructor(projectDir: string, script: PreparedAttempt[]) {
    this.#projectDir = projectDir;
    this.#script = script;
  }

  get prepared(): number {
    return this.#script.length;
  }

  async run(attempt: Attempt): Promise<AttemptOutcome> {
    // The reply checks the request it answers: an attempt works in the run's worktree, never in the person's copy,
    // and asks for the kind and scenario prepared next.
    if (attempt.worktree === this.#projectDir) throw new Error(`The ${attempt.kind} attempt was sent to the person's working copy`);
    const next = this.#script[this.asked];
    const asked = `the ${attempt.kind} attempt for "${attempt.scenario}"`;
    if (next === undefined) throw new Error(`No prepared attempt left for ${asked}`);
    if (next.kind !== attempt.kind || next.scenario !== attempt.scenario) {
      throw new Error(`Expected the ${next.kind} attempt for "${next.scenario}", got ${asked}`);
    }
    this.asked += 1;
    // The executor counts its agent's turns and ends it between turns at the limit, as the Pi executor does with
    // finishTurn; an agent ended before it finished leaves no diff and no report.
    const wanted = next.turns ?? 1;
    const limit = attempt.limits?.turns ?? Number.POSITIVE_INFINITY;
    const outcome = { turns: Math.min(wanted, limit), stoppedAtLimit: wanted > limit };
    this.requests.push({
      kind: attempt.kind,
      refusal: attempt.refusal,
      files: await filesIn(attempt.worktree),
      ...outcome,
      history: lines(gitIn(attempt.worktree, "rev-list", "HEAD")),
      committed: lines(gitIn(attempt.worktree, "ls-tree", "-r", "--name-only", "HEAD")),
    });
    if (outcome.stoppedAtLimit) return outcome;
    await cp(next.dir, attempt.worktree, { recursive: true });
    for (const target of next.tries ?? []) this.tried.push({ kind: attempt.kind, target, result: await attempt.tools.try(target) });
    if (next.report !== null) attempt.tools.report(next.report ?? `scripted ${attempt.kind} attempt`);
    return outcome;
  }
}

function gitIn(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

function lines(text: string): string[] {
  return text.split("\n").filter((line) => line !== "");
}

/** The project's files in a worktree, relative to it, without git's or the shared node_modules. */
async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .filter((file) => !file.startsWith("node_modules") && !file.startsWith(".git"))
    .sort();
}

/** Puts `dir` in place of the prepared attempt of `kind` for `scenario`, and drops every attempt after it: with no retries, the run asks for nothing after a refusal. */
export function lastAttempt(script: PreparedAttempt[], kind: AttemptKind, scenario: string, dir: string): PreparedAttempt[] {
  const index = script.findIndex((attempt) => attempt.kind === kind && attempt.scenario === scenario);
  if (index === -1) throw new Error(`No prepared ${kind} attempt for "${scenario}"`);
  return [...script.slice(0, index), { kind, scenario, dir }];
}

/** Puts `dir` in place of the prepared attempt of `kind` for `scenario`, keeping every attempt after it. */
export function replacedAttempt(script: PreparedAttempt[], kind: AttemptKind, scenario: string, dir: string): PreparedAttempt[] {
  return script.map((attempt) => (attempt.kind === kind && attempt.scenario === scenario ? { kind, scenario, dir } : attempt));
}
