import type { AttemptKind, NextAttempt } from "./executor.ts";
import type { RoundEnd } from "./inner-loop.ts";
import type { Pending } from "./provisional.ts";
import type { Refusal } from "./refusal.ts";

// One scenario's build, as state and decisions (FR-RUN-02, FR-RUN-03, FR-RUN-04, FR-EVID-01, FR-EVID-03). The
// decisions are pure; ScenarioBuild runs the attempts, the checkpoints, the scratch copies and the log around them.

/** What a round ended asking for: the kind asked for, which kind asked, and why (FR-RUN-04). */
export type Asked = NextAttempt & { by: AttemptKind };

/** What one scenario's build carries from one attempt to the next. */
export interface ScenarioState {
  /** The steps attempt, Red first; then the rounds of test and code attempts. */
  phase: "steps" | "rounds";
  /** The round under way, from 1; 0 before the rounds. */
  round: number;
  /** The request the round under way ended in: it opens the next round. */
  request: Asked | undefined;
  /** The provisional Reds the code has yet to settle (FR-EVID-01). */
  pending: Pending;
  /** The scenario passed after an accepted attempt of the round under way: the round ends there. */
  passed: boolean;
  /** A mutant proved the scenario's steps, or tests of the round under way (FR-EVID-03). */
  provedByMutant: { steps: boolean; tests: boolean };
  /** The checkpoint before the scenario's first code attempt: the code an attempt asked for must fail on. */
  beforeCode: string | undefined;
  /** The last code attempt, and the last accepted one, by transcript number: the attempts that settle provisional Reds. */
  lastCode: number;
  lastAccepted: number;
}

export function startingState(): ScenarioState {
  return {
    phase: "steps",
    round: 0,
    request: undefined,
    pending: { tests: [] },
    passed: false,
    provedByMutant: { steps: false, tests: false },
    beforeCode: undefined,
    lastCode: 0,
    lastAccepted: 0,
  };
}

/** The state at a round's start: what the round before it ended in is behind it. */
export function startRound(state: ScenarioState): ScenarioState {
  return { ...state, phase: "rounds", round: state.round + 1, request: undefined, passed: false, provedByMutant: { ...state.provedByMutant, tests: false } };
}

/** How a round opens: with a test attempt, or with the attempt a request asked for, which knows who asked and why. */
export function roundOpening(request: Asked | undefined): { kind: AttemptKind; asked?: { by: AttemptKind; reason: string } } {
  return request === undefined ? { kind: "test" } : { kind: request.kind, asked: { by: request.by, reason: request.reason } };
}

/**
 * What follows a round's opening attempts: the round ends in a request or a refusal; it ends there after a steps
 * attempt asked for, or once the scenario passed; otherwise the code attempts follow.
 */
export function afterOpening(opening: AttemptKind, outcome: { refusal: Refusal | undefined; request: Asked | undefined; passed: boolean }): { end: RoundEnd<Asked> } | "code" {
  if (outcome.request !== undefined) return { end: { request: outcome.request } };
  if (outcome.refusal !== undefined) return { end: { refusal: outcome.refusal } };
  if (opening === "steps" || outcome.passed) return { end: undefined };
  return "code";
}

/** How a round's code attempts end it: in a request, which wins, a refusal, or done. */
export function afterCode(outcome: { refusal: Refusal | undefined; request: Asked | undefined }): RoundEnd<Asked> {
  if (outcome.request !== undefined) return { request: outcome.request };
  return outcome.refusal === undefined ? undefined : { refusal: outcome.refusal };
}

/** Whether oid runs the scenario before it decides on a request: after an accepted attempt, once the rounds started. */
export function checksScenarioFirst(phase: ScenarioState["phase"], accepted: boolean): boolean {
  return phase === "rounds" && accepted;
}

/** Whether a request is followed: only in the rounds, and not once the scenario passes (FR-RUN-04). */
export function followsRequest(phase: ScenarioState["phase"], scenarioPassed: boolean): boolean {
  return phase === "rounds" && !scenarioPassed;
}

/** What a followed request does to the attempt that made it: it ends the round, so a refused one is undone now and not retried. */
export function onFollowedRequest(refused: boolean): { undoNow: boolean; final: true } {
  return { undoNow: refused, final: true };
}

/**
 * Whether an attempt may prove a Red with a mutant (FR-EVID-03): the scenario's own steps attempt, and the test
 * attempts of its rounds; never one another attempt asked for, a repair, or one the gate sent back.
 */
export function takesMutant(kind: AttemptKind, phase: ScenarioState["phase"], origin: "own" | "asked" | "repair"): boolean {
  if (origin !== "own") return false;
  return (kind === "steps" && phase === "steps") || (kind === "test" && phase === "rounds");
}

/** Whether the steps phase ends the scenario's build: steps a mutant proved pass on the current code, so it is built. */
export function builtBySteps(state: ScenarioState): boolean {
  return state.provedByMutant.steps;
}

/** An accepted code attempt makes every unit test pass: it confirms the provisional tests, and is the last accepted. */
export function onCodeAccepted(state: ScenarioState, attempt: number): { state: ScenarioState; confirmed: string[] } {
  return { state: { ...state, lastAccepted: attempt, pending: { ...state.pending, tests: [] } }, confirmed: state.pending.tests };
}

/** A refuted test goes to its one repair: it leaves the pending tests, and its repair is judged as a new test. */
export function onRepair(state: ScenarioState, tests: string[]): ScenarioState {
  return { ...state, pending: { ...state.pending, tests: state.pending.tests.filter((test) => !tests.includes(test)) } };
}
