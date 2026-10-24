export type AttemptKind = "steps" | "test" | "code";

export interface Attempt {
  kind: AttemptKind;
  fr: string;
  /** The run's worktree, where the attempt writes its diff. */
  worktree: string;
}

/** The structured end of an attempt. */
export interface Report {
  result: string;
}

/** Runs one attempt's agent: Pi, or the scripted executor of oid's own tests. oid judges the diff the same way for both. */
export interface Executor {
  run(attempt: Attempt): Promise<Report>;
}
