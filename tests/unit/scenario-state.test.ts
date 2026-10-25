import { describe, expect, test } from "vitest";
import {
  afterCode,
  afterOpening,
  builtBySteps,
  checksScenarioFirst,
  followsRequest,
  onCodeAccepted,
  onFollowedRequest,
  onRepair,
  roundOpening,
  startingState,
  startRound,
  takesMutant,
} from "../../src/scenario-state.ts";

const REFUSAL = { failed: "f", evidence: "e", next: "n" };
const STEPS_ASKED = { kind: "steps" as const, by: "code" as const, reason: "the shared Then step" };

describe("startRound", () => {
  test("counts the round and leaves behind what the round before it ended in", () => {
    const before = { ...startingState(), round: 2, request: STEPS_ASKED, passed: true, provedByMutant: { steps: true, tests: true } };

    expect(startRound(before)).toMatchObject({ phase: "rounds", round: 3, request: undefined, passed: false, provedByMutant: { steps: true, tests: false } });
  });
});

describe("roundOpening", () => {
  test("opens with a test attempt, or with the kind a request asked for, saying who asked and why", () => {
    expect(roundOpening(undefined)).toEqual({ kind: "test" });
    expect(roundOpening(STEPS_ASKED)).toEqual({ kind: "steps", asked: { by: "code", reason: "the shared Then step" } });
  });
});

describe("afterOpening", () => {
  const nothing = { refusal: undefined, request: undefined, passed: false };

  test("a request wins over a refusal, and ends the round in it", () => {
    expect(afterOpening("test", { ...nothing, refusal: REFUSAL, request: STEPS_ASKED })).toEqual({ end: { request: STEPS_ASKED } });
  });

  test("a refusal ends the round in it", () => {
    expect(afterOpening("test", { ...nothing, refusal: REFUSAL })).toEqual({ end: { refusal: REFUSAL } });
  });

  test("a steps attempt asked for, or a scenario that passed, ends the round; otherwise the code attempts follow", () => {
    expect([afterOpening("steps", nothing), afterOpening("test", { ...nothing, passed: true }), afterOpening("test", nothing)]).toEqual([
      { end: undefined },
      { end: undefined },
      "code",
    ]);
  });
});

describe("afterCode", () => {
  test("ends the round in a request, which wins, in a refusal, or done", () => {
    expect([afterCode({ refusal: REFUSAL, request: STEPS_ASKED }), afterCode({ refusal: REFUSAL, request: undefined }), afterCode({ refusal: undefined, request: undefined })]).toEqual([
      { request: STEPS_ASKED },
      { refusal: REFUSAL },
      undefined,
    ]);
  });
});

describe("requests", () => {
  test("the scenario runs before a request is decided only after an accepted attempt of the rounds", () => {
    expect([checksScenarioFirst("rounds", true), checksScenarioFirst("rounds", false), checksScenarioFirst("steps", true)]).toEqual([true, false, false]);
  });

  test("a request is followed only in the rounds, and not once the scenario passes", () => {
    expect([followsRequest("rounds", false), followsRequest("rounds", true), followsRequest("steps", false)]).toEqual([true, false, false]);
  });

  test("a followed request ends its attempt: a refused one is undone now, and never retried", () => {
    expect([onFollowedRequest(true), onFollowedRequest(false)]).toEqual([
      { undoNow: true, final: true },
      { undoNow: false, final: true },
    ]);
  });
});

describe("mutants", () => {
  test("only the scenario's own steps attempt and its rounds' own test attempts take a mutant", () => {
    expect([
      takesMutant("steps", "steps", "own"),
      takesMutant("test", "rounds", "own"),
      takesMutant("steps", "rounds", "own"),
      takesMutant("test", "rounds", "asked"),
      takesMutant("test", "rounds", "repair"),
      takesMutant("code", "rounds", "own"),
    ]).toEqual([true, true, false, false, false, false]);
  });

  test("steps a mutant proved end the scenario's build", () => {
    expect([builtBySteps({ ...startingState(), provedByMutant: { steps: true, tests: false } }), builtBySteps(startingState())]).toEqual([true, false]);
  });
});

describe("provisional Reds", () => {
  test("an accepted code attempt confirms the pending tests and is the last accepted", () => {
    const state = { ...startingState(), pending: { tests: ["a > t"], scenario: "s" } };

    const { state: after, confirmed } = onCodeAccepted(state, 5);

    expect({ confirmed, pending: after.pending, lastAccepted: after.lastAccepted }).toEqual({ confirmed: ["a > t"], pending: { tests: [], scenario: "s" }, lastAccepted: 5 });
  });

  test("a test sent to its repair leaves the pending tests", () => {
    expect(onRepair({ ...startingState(), pending: { tests: ["a > t", "b > u"] } }, ["a > t"]).pending.tests).toEqual(["b > u"]);
  });
});
