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
}

/** One test file, or the attempt's own scenario. */
export type TryTarget = { test: string } | { scenario: true };

/** A pass, or a failure in the shape of a refusal. */
export type TryResult = { passed: true } | ({ passed: false } & Refusal);

/** What oid gives an attempt's agent to call, besides reading and writing files. */
export interface AttemptTools {
  /** Runs the target, then the type check on the files the attempt changed. It records nothing. */
  try(target: TryTarget): Promise<TryResult>;
}

/** The structured end of an attempt. */
export interface Report {
  result: string;
}

/** Runs one attempt's agent: Pi, or the scripted executor of oid's own tests. oid judges the diff the same way for both. */
export interface Executor {
  run(attempt: Attempt): Promise<Report>;
}
