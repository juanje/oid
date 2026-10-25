import { appendFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Scenario } from "./cucumber-messages.ts";
import type { AttemptKind } from "./executor.ts";
import { git } from "./git.ts";
import { provisionalOf } from "./evidence.ts";
import { changesNextKind } from "./requests.ts";
import type { Refusal } from "./refusal.ts";

// The run log (FR-STATE-02): append-only, one JSON event per line, in the repository's .git/oid/runs. Everything in it
// is computed by oid; what an agent says of itself never reaches it. The one exception is a request's reason, which is
// the next attempt's input (FR-RUN-04), as a refusal's evidence is: no measure is computed from it.

export interface AttemptEvent {
  event: "attempt";
  kind: AttemptKind;
  scenario: string;
  verdict: "accepted" | "refused" | "stopped at the turn limit" | "stopped on an error";
  /** The attempt came with the refusal of the one before it. */
  retry: boolean;
  refusal?: Refusal;
  /** Another attempt asked for this one (FR-RUN-04). */
  asked?: true;
  /** The valid Reds an accepted steps or test attempt showed, each as `<what failed>: <class>`. */
  reds?: string[];
  /** As the executor reported them. */
  turns: number;
  model?: string;
  tokens?: number;
  /** Of the tokens, those read from the provider's cache. */
  cacheRead?: number;
  cost?: number;
  deniedToolCalls?: number;
}

export interface StartEvent {
  event: "start";
  /** The version of oid that made the run, so that runs can be compared by it; logs before 0.1.0 do not have it. */
  oid?: string;
  fr: string;
  /** The FR's scenarios, in the order the run builds them. */
  scenarios: Scenario[];
  branch: string;
  checkpoints: string;
}

/** A scenario that passes, with every attempt it took accepted. */
export interface ScenarioEvent extends Scenario {
  event: "scenario";
  verdict: "built";
}

/** A stage of the run starts (FR-CLI-05). */
export interface StageEvent {
  event: "stage";
  stage: "agent" | "worktree" | "scenarios" | "unit tests" | "gate" | "commit";
}

/** An attempt starts; its end is its attempt event (FR-CLI-05). */
export interface AttemptingEvent {
  event: "attempting";
  kind: AttemptKind;
  scenario: string;
  retry: boolean;
}

/** A run of the gate, and when it refuses, the kind of attempt the refusal goes back to, if any (FR-GATE-04). */
export interface GateEvent {
  event: "gate";
  verdict: "passed" | "refused";
  refusal?: Refusal;
  sendTo?: AttemptKind;
}

/** A provisional Red the code settled: confirmed when it made it pass, refuted when its attempts ran out (FR-EVID-01). */
export interface RedEvent {
  event: "red";
  /** The test, or the scenario as `<uri>:<line> "<name>"`. */
  what: string;
  verdict: "confirmed" | "refuted";
  /** The code attempt that settled it, by its transcript number. */
  attempt: number;
}

/**
 * An attempt asked for another kind next (FR-RUN-04). The reason is the agent's own words: it is what the next
 * attempt's task gives, as a refusal's evidence is, and no measure is computed from it.
 */
export interface RequestEvent {
  event: "request";
  scenario: string;
  by: AttemptKind;
  kind: AttemptKind;
  reason: string;
  /** Whether the run followed it; logs of 0.1.11 do not say. */
  followed?: boolean;
}

/** A round of a scenario's inner loop that made no progress, with the step where the scenario still fails (FR-RUN-03). */
export interface RoundEvent {
  event: "round";
  scenario: string;
  verdict: "no progress";
  step: string;
  /** The failure's message, without its stack lines. */
  failure: string;
}

export interface StopEvent {
  event: "stop";
  limit: "turns" | "rounds";
  /** The scenario that reached the round limit. */
  scenario?: string;
}

export interface Measures {
  attempts: Partial<Record<AttemptKind, number>>;
  rejections: Partial<Record<AttemptKind, number>>;
  /** Retries refused with the same failure and evidence as the attempt before them. */
  blindRetries: number;
  tokens: number;
  /** Of the tokens, those read from the provider's cache; logs before 0.1.2 do not have it. */
  cacheRead?: number;
  cost: number;
  deniedToolCalls: number;
  /**
   * Requests for another attempt kind: all of them, those the run followed that changed the next kind, and the attempts
   * asked for that were accepted (FR-RUN-04); logs before 0.1.11 do not have it, and those of 0.1.11 not `changing`.
   */
  requests?: { asked: number; changing?: number; accepted: number };
  /** Rounds after which the scenario failed the same way (FR-RUN-03); logs before 0.1.10 do not have it. */
  noProgressRounds?: number;
  /** The provisional Reds accepted, and of those, the ones confirmed and refuted; logs before 0.1.8 do not have it. */
  provisional?: { accepted: number; confirmed: number; refuted: number };
  /** The run's time, on a monotonic clock, so that a suspended machine does not count. */
  timeMs: number;
}

export interface EndEvent {
  event: "end";
  exitCode: number;
  measures: Measures;
}

export type LogEvent = StageEvent | StartEvent | AttemptingEvent | AttemptEvent | GateEvent | ScenarioEvent | RedEvent | RoundEvent | RequestEvent | StopEvent | EndEvent;

export interface RunLog {
  path: string;
  append(event: LogEvent): Promise<void>;
}

/** The log of run `runId`, in the repository's .git/oid/runs, whichever of its worktrees `dir` is in. */
export async function openRunLog(dir: string, runId: string): Promise<RunLog> {
  const runs = join(resolve(dir, await git(dir, "rev-parse", "--git-common-dir")), "oid", "runs");
  await mkdir(runs, { recursive: true });
  const path = join(runs, `${runId}.jsonl`);
  return { path, append: (event) => appendFile(path, `${JSON.stringify(event)}\n`) };
}

export interface RunRecorder {
  /** The log's file. */
  path: string;
  /** Every event so far, in order. */
  events: LogEvent[];
  record(event: LogEvent): Promise<void>;
  /** Appends the end of the run, with its measures and its time since the log started. */
  end(exitCode: number): Promise<void>;
}

/**
 * Starts run `runId`'s log, and its clock: a monotonic one, so that a suspended machine does not count. `onEvent` sees
 * each event as it is recorded: the run's progress is shown from them (FR-CLI-05).
 */
export async function startRunLog(dir: string, runId: string, onEvent: (event: LogEvent) => void = () => {}): Promise<RunRecorder> {
  const started = performance.now();
  const log = await openRunLog(dir, runId);
  const events: LogEvent[] = [];
  const record = async (event: LogEvent): Promise<void> => {
    events.push(event);
    onEvent(event);
    await log.append(event);
  };
  return {
    path: log.path,
    events,
    record,
    end: (exitCode) => record({ event: "end", exitCode, measures: measuresOf(events, performance.now() - started) }),
  };
}

/** The run's measures, from its attempt events, and its time. */
export function measuresOf(events: LogEvent[], timeMs: number): Measures {
  const attempts = events.filter((event): event is AttemptEvent => event.event === "attempt");
  const gateRejections = events.flatMap((event) => (event.event === "gate" && event.verdict === "refused" && event.sendTo !== undefined ? [event.sendTo] : []));
  const provisional = { accepted: 0, confirmed: 0, refuted: 0 };
  const noProgressRounds = events.filter((event) => event.event === "round").length;
  const asked = events.filter((event) => event.event === "request");
  const requests = {
    asked: asked.length,
    changing: asked.filter((request) => request.followed === true && changesNextKind(request.by, request.kind)).length,
    accepted: attempts.filter((attempt) => attempt.asked === true && attempt.verdict === "accepted").length,
  };
  const measures: Measures = { attempts: {}, rejections: {}, blindRetries: 0, noProgressRounds, requests, tokens: 0, cacheRead: 0, cost: 0, deniedToolCalls: 0, provisional, timeMs };
  const last = new Map<AttemptKind, AttemptEvent>();
  for (const attempt of attempts) {
    measures.attempts[attempt.kind] = (measures.attempts[attempt.kind] ?? 0) + 1;
    if (attempt.verdict === "refused") measures.rejections[attempt.kind] = (measures.rejections[attempt.kind] ?? 0) + 1;
    const before = last.get(attempt.kind)?.refusal;
    if (attempt.retry && attempt.refusal !== undefined && before !== undefined && sameFailure(attempt.refusal, before)) measures.blindRetries += 1;
    measures.tokens += attempt.tokens ?? 0;
    measures.cacheRead = (measures.cacheRead ?? 0) + (attempt.cacheRead ?? 0);
    measures.cost += attempt.cost ?? 0;
    measures.deniedToolCalls += attempt.deniedToolCalls ?? 0;
    provisional.accepted += provisionalOf(attempt.reds ?? []).length;
    last.set(attempt.kind, attempt);
  }
  for (const event of events) if (event.event === "red") provisional[event.verdict] += 1;
  // A refusal of the gate rejects the work of the attempt kind it goes back to.
  for (const kind of gateRejections) measures.rejections[kind] = (measures.rejections[kind] ?? 0) + 1;
  return measures;
}

function sameFailure(one: Refusal, other: Refusal): boolean {
  return one.failed === other.failed && one.evidence === other.evidence;
}
