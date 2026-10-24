import { describe, expect, test } from "vitest";
import type { AttemptKind } from "../../src/executor.ts";
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
/** The gate failing on type errors in `files` only, with `tests` unit tests run. */
const typesFail = (files: string[], tests = 3): CheckResult[] => {
  // As the gate's types check gives them: tsc's output is the failure.
  const output = files.map((file) => `${file}(1,1): error TS2322`).join("\n");
  return [{ name: "types", passed: false, output, failures: [output], failedFiles: files }, { name: "unit", passed: true, output: "", tests }, { name: "scenarios", passed: true, output: "" }];
};
const passingWith = (tests: number): CheckResult[] => [PASSING[0]!, { ...PASSING[1]!, tests }, PASSING[2]!];
const UNKNOWN_OPTION: CheckResult[] = [{ name: "types", passed: false, output: "", unknownOption: "noSuchCompilerOption" }, ...PASSING.slice(1)];

/** A gate that answers each run with the next of `answers`, and attempts after it that record their kind and refusal. */
function fakes(answers: CheckResult[][]) {
  const given: Refusal[] = [];
  const kinds: AttemptKind[] = [];
  const gate = async () => answers.shift()!;
  const afterGate = async (kind: AttemptKind, refusal: Refusal) => {
    kinds.push(kind);
    given.push(refusal);
    return { refusal: undefined, rollback: async () => {} };
  };
  return { gate, afterGate, given, kinds };
}

describe("gateLoop", () => {
  test("a failing scenario goes back to a code attempt with the gate's refusal in focus, then the gate runs again", async () => {
    const { gate, afterGate, given, kinds } = fakes([SCENARIO_FAILS, PASSING]);

    const outcome = await gateLoop(1, gate, afterGate);

    expect(outcome).toEqual({ refusal: undefined });
    expect(kinds).toEqual(["code"]);
    expect(given.map((refusal) => refusal.focus?.scenarios)).toEqual([[GREET_02_FIRST]]);
  });

  test("when the code attempts after the gate run out, the gate's last refusal ends the run", async () => {
    const { gate, afterGate, given } = fakes([SCENARIO_FAILS, SCENARIO_FAILS]);

    const outcome = await gateLoop(1, gate, afterGate);

    expect({ refused: "refusal" in outcome && outcome.refusal !== undefined, codeAttempts: given.length }).toEqual({ refused: true, codeAttempts: 1 });
  });

  test("a type error goes back to the attempt kind that owns its file, with the error as evidence", async () => {
    const { gate, afterGate, given, kinds } = fakes([typesFail(["tests/a.test.ts"]), PASSING]);

    const outcome = await gateLoop(1, gate, afterGate);

    expect(outcome).toEqual({ refusal: undefined });
    expect(kinds).toEqual(["test"]);
    expect(given[0]!.evidence).toContain("tests/a.test.ts");
  });

  test("type errors in files of several owners go back one owner at a time, outside-in, each counting as a retry", async () => {
    const { gate, afterGate, kinds } = fakes([typesFail(["src/a.ts", "features/steps/a.steps.ts"]), typesFail(["src/a.ts"]), PASSING]);

    const outcome = await gateLoop(2, gate, afterGate);

    expect(outcome).toEqual({ refusal: undefined });
    expect(kinds).toEqual(["steps", "code"]);
  });

  test("a type error in a file no kind writes goes back to a code attempt", async () => {
    const { gate, afterGate, kinds } = fakes([typesFail(["scripts/build.ts"]), PASSING]);

    await gateLoop(1, gate, afterGate);

    expect(kinds).toEqual(["code"]);
  });

  test("an attempt after the gate that leaves fewer tests is refused, and goes back again as a retry", async () => {
    const { gate, afterGate, given, kinds } = fakes([typesFail(["tests/a.test.ts"], 3), passingWith(2), passingWith(3)]);

    const outcome = await gateLoop(2, gate, afterGate);

    expect(outcome).toEqual({ refusal: undefined });
    expect(kinds).toEqual(["test", "test"]);
    expect(given[1]!.evidence).toMatch(/3[^]*2/);
  });

  test("when the retries run out on a type error, the gate's refusal ends the run", async () => {
    const { gate, afterGate, kinds } = fakes([typesFail(["src/a.ts"]), typesFail(["src/a.ts"])]);

    const outcome = await gateLoop(1, gate, afterGate);

    expect({ refused: "refusal" in outcome && outcome.refusal !== undefined, kinds }).toEqual({ refused: true, kinds: ["code"] });
  });

  test("a runner that does not know an option is an error, never sent back", async () => {
    const { gate, afterGate, given } = fakes([UNKNOWN_OPTION, PASSING]);

    const outcome = await gateLoop(2, gate, afterGate);

    expect({ outcome, codeAttempts: given.length }).toEqual({ outcome: { error: expect.stringContaining("noSuchCompilerOption") }, codeAttempts: 0 });
  });
});
