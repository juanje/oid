import type { Layout } from "./boundaries.ts";
import type { Refusal } from "./refusal.ts";

export type AttemptKind = "steps" | "test" | "code" | "refactor-code";

/** The kinds a project's paths name (FR-AGENT-04): a refactor-code attempt writes the code's paths. */
export type PathsKind = "steps" | "test" | "code";

/**
 * What a report can submit when its scenario or new test passes before its code (FR-EVID-03): edits to the source, in
 * the shape of the edit tool, which oid applies only in a scratch copy, with the reason.
 */
export interface Mutant {
  reason: string;
  files: { path: string; edits: { oldText: string; newText: string }[] }[];
}

/** What a report can ask for: another attempt kind next, with its reason (FR-RUN-04). */
export interface NextAttempt {
  kind: AttemptKind;
  reason: string;
}

export interface Attempt {
  kind: AttemptKind;
  fr: string;
  /** The name of the scenario the attempt works on. */
  scenario: string;
  /** The run's worktree, where the attempt writes its diff. */
  worktree: string;
  /** Where the project keeps each kind of file: what the attempt may write, as its prompt states it (FR-AGENT-04). */
  layout: Layout;
  tools: AttemptTools;
  /** The refusal that led to this attempt, when it is a retry: the most useful part of its task (FR-AGENT-03). */
  refusal?: Refusal;
  /** For an attempt another one asked for: which kind asked, and why (FR-RUN-04). */
  asked?: { by: AttemptKind; reason: string };
  /** The executor ends its agent between turns when it reaches `turns` (with Pi, finishTurn returning { action: "end" }). */
  limits: { turns: number; outputTokens: number };
  /** What the task gives the agent besides its kind and scenario (FR-AGENT-03). */
  context?: TaskContext;
  /** Where the executor keeps its agent's whole session, as JSONL, when it has one to keep (FR-STATE-02). */
  transcript?: string;
}

/** What oid gathers for an attempt's task from the project and its own judgment (FR-AGENT-03). */
export interface TaskContext {
  /** The FR's heading and text from the spec, when the spec has it. */
  fr?: string;
  /** The scenario's steps, with their keywords. */
  steps: string[];
  /** Where the scenario fails now, for an attempt after its steps: the step, its message, and the step's definition. */
  failure?: { step: string; message: string; definition?: { file: string; line: number; source: string } };
  /** The code relevant to the scenario, chosen by imports, and the relevant files left out of the budget. */
  code?: { files: { path: string; content: string }[]; cut: string[] };
  /** For a steps attempt, the patterns of the step definitions the project has, as `<file>: <pattern>`. */
  patterns?: string[];
  /** The project's domain and its conventions, when it keeps them. */
  domain?: string;
  conventions?: string;
  /** For a cleanup attempt, the finding it removes, rendered with its places (FR-REF-02). */
  finding?: string;
}

/** What the executor reports of an attempt: its agent's turns, which the executor counts, never the model. */
export interface AttemptOutcome {
  turns: number;
  /** The executor ended the agent at the turn limit, before it finished. */
  stoppedAtLimit: boolean;
  /** The agent's model and use, as the executor measured them (FR-STATE-02). */
  model?: string;
  tokens?: number;
  /** Of the tokens, those read from the provider's cache: what makes two runs' costs comparable. */
  cacheRead?: number;
  cost?: number;
  deniedToolCalls?: number;
  /** The turns the output limit cut: their tool calls did not run (FR-RUN-09). */
  cutTurns?: number;
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
  /** Ends the attempt with its result in a few words, and may ask for another attempt kind next. An attempt that never calls it is refused. */
  report(result: string, next?: NextAttempt, mutant?: Mutant): void;
}

/** Runs one attempt's agent: Pi, or the scripted executor of oid's own tests. oid judges the diff the same way for both. */
export interface Executor {
  run(attempt: Attempt): Promise<AttemptOutcome>;
}
