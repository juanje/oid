import type { Refusal } from "./refusal.ts";

export type AttemptKind = "steps" | "test" | "code";

export interface Attempt {
  kind: AttemptKind;
  fr: string;
  /** The name of the scenario the attempt works on. */
  scenario: string;
  /** The run's worktree, where the attempt writes its diff. */
  worktree: string;
  tools: AttemptTools;
  /** The refusal that led to this attempt, when it is a retry: the most useful part of its task (FR-AGENT-03). */
  refusal?: Refusal;
  /** The executor ends its agent between turns when it reaches `turns` (with Pi, finishTurn returning { action: "end" }). */
  limits: { turns: number };
}

/** What the executor reports of an attempt: its agent's turns, which the executor counts, never the model. */
export interface AttemptOutcome {
  turns: number;
  /** The executor ended the agent at the turn limit, before it finished. */
  stoppedAtLimit: boolean;
  /** The agent's model and use, as the executor measured them (FR-STATE-02). */
  model?: string;
  tokens?: number;
  cost?: number;
  deniedToolCalls?: number;
  /** The agent stopped on an error no attempt can fix, such as a provider error its executor's own retries did not clear. */
  error?: string;
}

/** One test file, or the attempt's own scenario. */
export type TryTarget = { test: string } | { scenario: true };

/** A pass, or a failure in the shape of a refusal. */
export type TryResult = { passed: true } | ({ passed: false } & Refusal);

/** What oid gives an attempt's agent to call, besides reading and writing files. */
export interface AttemptTools {
  /** Runs the target, then the type check on the files the attempt changed. It records nothing. */
  try(target: TryTarget): Promise<TryResult>;
  /** Ends the attempt with its result in a few words. An attempt that never calls it is refused. */
  report(result: string): void;
}

/** Runs one attempt's agent: Pi, or the scripted executor of oid's own tests. oid judges the diff the same way for both. */
export interface Executor {
  run(attempt: Attempt): Promise<AttemptOutcome>;
}
