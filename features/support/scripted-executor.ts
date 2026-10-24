import { cp } from "node:fs/promises";
import type { Attempt, AttemptKind, Executor, Report } from "../../src/executor.ts";

/** One attempt the scripted executor answers with: the request it expects, and the files that land as its diff. */
export interface PreparedAttempt {
  kind: AttemptKind;
  scenario: string;
  dir: string;
}

/** An executor that answers each request with the next prepared attempt, the way an agent's diff would land. */
export class ScriptedExecutor implements Executor {
  asked = 0;
  readonly #projectDir: string;
  readonly #script: PreparedAttempt[];

  constructor(projectDir: string, script: PreparedAttempt[]) {
    this.#projectDir = projectDir;
    this.#script = script;
  }

  get prepared(): number {
    return this.#script.length;
  }

  async run(attempt: Attempt): Promise<Report> {
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
    await cp(next.dir, attempt.worktree, { recursive: true });
    return { result: `scripted ${attempt.kind} attempt` };
  }
}

/** Puts `dir` in place of the prepared attempt of `kind` for `scenario`, and drops every attempt after it: with no retries, the run asks for nothing after a refusal. */
export function lastAttempt(script: PreparedAttempt[], kind: AttemptKind, scenario: string, dir: string): PreparedAttempt[] {
  const index = script.findIndex((attempt) => attempt.kind === kind && attempt.scenario === scenario);
  if (index === -1) throw new Error(`No prepared ${kind} attempt for "${scenario}"`);
  return [...script.slice(0, index), { kind, scenario, dir }];
}
