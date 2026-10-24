import { describe, expect, test } from "vitest";
import type { CheckResult } from "../../src/gate.ts";
import { gateLoop } from "../../src/gate-loop.ts";
import type { Refusal } from "../../src/refusal.ts";
import { GREET_02_FIRST } from "./support/recorded.ts";

const PASSING: CheckResult[] = [
  { name: "types", passed: true, output: "" },
  { name: "unit", passed: true, output: "" },
  { name: "scenarios", passed: true, output: "" },
];
const SCENARIO_FAILS: CheckResult[] = [
  { name: "types", passed: true, output: "" },
  { name: "unit", passed: true, output: "" },
  { name: "scenarios", passed: false, output: "", failures: ["broken"], failedScenarios: [{ ...GREET_02_FIRST, status: "failed" }] },
];
const TYPES_FAIL: CheckResult[] = [{ name: "types", passed: false, output: "src/a.ts(1,1): error TS2322" }, ...PASSING.slice(1)];
const UNKNOWN_OPTION: CheckResult[] = [{ name: "types", passed: false, output: "", unknownOption: "noSuchCompilerOption" }, ...PASSING.slice(1)];

/** A gate that answers each run with the next of `answers`, and a code attempt that records what it was given. */
function fakes(answers: CheckResult[][]) {
  const given: Refusal[] = [];
  const gate = async () => answers.shift()!;
  const codeAfterGate = async (refusal: Refusal) => {
    given.push(refusal);
    return { refusal: undefined, rollback: async () => {} };
  };
  return { gate, codeAfterGate, given };
}

describe("gateLoop", () => {
  test("a failing scenario goes back to a code attempt with the gate's refusal in focus, then the gate runs again", async () => {
    const { gate, codeAfterGate, given } = fakes([SCENARIO_FAILS, PASSING]);

    const outcome = await gateLoop(1, gate, codeAfterGate);

    expect(outcome).toEqual({ refusal: undefined });
    expect(given.map((refusal) => refusal.focus?.scenarios)).toEqual([[GREET_02_FIRST]]);
  });

  test("when the code attempts after the gate run out, the gate's last refusal ends the run", async () => {
    const { gate, codeAfterGate, given } = fakes([SCENARIO_FAILS, SCENARIO_FAILS]);

    const outcome = await gateLoop(1, gate, codeAfterGate);

    expect({ refused: "refusal" in outcome && outcome.refusal !== undefined, codeAttempts: given.length }).toEqual({ refused: true, codeAttempts: 1 });
  });

  test("a type error is not sent back in the skeleton: it ends the run as a refusal", async () => {
    const { gate, codeAfterGate, given } = fakes([TYPES_FAIL, PASSING]);

    const outcome = await gateLoop(2, gate, codeAfterGate);

    expect({ refused: "refusal" in outcome && outcome.refusal !== undefined, codeAttempts: given.length }).toEqual({ refused: true, codeAttempts: 0 });
  });

  test("a runner that does not know an option is an error, never sent back", async () => {
    const { gate, codeAfterGate, given } = fakes([UNKNOWN_OPTION, PASSING]);

    const outcome = await gateLoop(2, gate, codeAfterGate);

    expect({ outcome, codeAttempts: given.length }).toEqual({ outcome: { error: expect.stringContaining("noSuchCompilerOption") }, codeAttempts: 0 });
  });
});
