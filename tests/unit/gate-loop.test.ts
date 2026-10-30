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
const BRANCH = "src/greet.ts:3:10: branch 0 of a conditional expression";
const COVERAGE_FAILS: CheckResult[] = [...PASSING, { name: "coverage", passed: false, output: BRANCH, failures: [BRANCH] }];
const passingWith = (tests: number): CheckResult[] => [PASSING[0]!, { ...PASSING[1]!, tests }, PASSING[2]!];
const UNKNOWN_OPTION: CheckResult[] = [{ name: "types", passed: false, output: "", unknownOption: "noSuchCompilerOption" }, ...PASSING.slice(1)];

/** A gate that answers each run with the next of `answers`, and attempts after it that record their kind and refusal, each ending with `report`. */
function fakes(answers: CheckResult[][], report?: string) {
  const given: Refusal[] = [];
  const kinds: AttemptKind[] = [];
  const gate = async () => answers.shift()!;
  const afterGate = async (kind: AttemptKind, refusal: Refusal) => {
    kinds.push(kind);
    given.push(refusal);
    return { refusal: undefined, rollback: async () => {}, ...(report === undefined ? {} : { report }) };
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
    expect(given.map((refusal) => refusal.from)).toEqual(["gate", "gate"]);
  });

  test("when the retries run out on a type error, the gate's refusal ends the run", async () => {
    const { gate, afterGate, kinds } = fakes([typesFail(["src/a.ts"]), typesFail(["src/a.ts"])]);

    const outcome = await gateLoop(1, gate, afterGate);

    expect({ refused: "refusal" in outcome && outcome.refusal !== undefined, kinds }).toEqual({ refused: true, kinds: ["code"] });
  });

  test("tells each gate run's verdict, and a refusal's kind to go back to", async () => {
    const { gate, afterGate } = fakes([typesFail(["tests/a.test.ts"]), PASSING]);
    const runs: { verdict: string; sendTo?: AttemptKind }[] = [];

    await gateLoop(1, gate, afterGate, async (refusal, sendTo) => {
      runs.push({ verdict: refusal === undefined ? "passed" : "refused", ...(sendTo === undefined ? {} : { sendTo }) });
    });

    expect(runs).toEqual([{ verdict: "refused", sendTo: "test" }, { verdict: "passed" }]);
  });

  test("gives a refusal a next step for the kind of attempt it goes back to", async () => {
    const nextFor = async (files: string[]) => {
      const { gate, afterGate, given } = fakes([typesFail(files), PASSING]);
      await gateLoop(1, gate, afterGate);
      return given[0]!.next;
    };

    expect(await nextFor(["src/a.ts"])).toMatch(/\bcode\b/);
    for (const [file, kind] of [["tests/a.test.ts", /\bunit tests?\b/], ["features/steps/a.steps.ts", /\bstep definitions?\b/]] as const) {
      const next = await nextFor([file]);
      expect(next).toMatch(kind);
      expect(next).not.toMatch(/\bthe code\b/);
    }
  });

  test("an uncovered branch goes back to a test attempt first, with the branch as evidence and the branches it must cover", async () => {
    const { gate, afterGate, given, kinds } = fakes([COVERAGE_FAILS, PASSING]);

    const outcome = await gateLoop(1, gate, afterGate);

    expect(outcome).toEqual({ refusal: undefined });
    expect(kinds).toEqual(["test"]);
    expect(given[0]!.evidence).toContain(BRANCH);
    expect(given[0]!.uncovered).toEqual([BRANCH]);
  });

  test("a branch still uncovered after the test attempt goes to a code attempt, with the test attempt's report; the test attempt, with retries of its own, is not one of the gate's", async () => {
    const report = "No requirement asks for this branch";
    const { gate, afterGate, given, kinds } = fakes([COVERAGE_FAILS, COVERAGE_FAILS, PASSING], report);

    const outcome = await gateLoop(1, gate, afterGate);

    expect(outcome).toEqual({ refusal: undefined, removed: { branches: [BRANCH], report } });
    expect(kinds).toEqual(["test", "code"]);
    expect(given[1]!.evidence).toContain(BRANCH);
    expect(given[1]!.evidence).toContain(report);
  });

  test("a test attempt for uncovered branches whose retries run out ends the run with its refusal, and no code attempt has them", async () => {
    const ranOut: Refusal = { failed: "The branches the test attempt was sent for are still untaken", evidence: BRANCH, next: "", uncovered: [BRANCH] };
    const kinds: AttemptKind[] = [];
    const answers = [COVERAGE_FAILS, COVERAGE_FAILS, PASSING];
    const afterGate = async (kind: AttemptKind) => {
      kinds.push(kind);
      return { refusal: kind === "test" ? ranOut : undefined, rollback: async () => {} };
    };

    const outcome = await gateLoop(1, async () => answers.shift()!, afterGate);

    expect(outcome).toEqual({ refusal: ranOut });
    expect(kinds).toEqual(["test"]);
  });

  test("a code attempt for uncovered branches that leaves as many untaken, wherever they now are, is refused as having moved them, and goes back as a retry", async () => {
    const moved = "src/greet.ts:7:10: branch 0 of a conditional expression";
    const MOVED: CheckResult[] = [...PASSING, { name: "coverage", passed: false, output: moved, failures: [moved] }];
    const { gate, afterGate, given, kinds } = fakes([COVERAGE_FAILS, COVERAGE_FAILS, MOVED, PASSING], "No requirement asks for this branch");

    const outcome = await gateLoop(2, gate, afterGate);

    expect(outcome).toEqual({ refusal: undefined, removed: { branches: [BRANCH], report: "No requirement asks for this branch" } });
    expect(kinds).toEqual(["test", "code", "code"]);
    expect(given[2]!.failed).toMatch(/\bmoved\b/);
    expect(given[2]!.evidence).toContain(moved);
  });

  test("a code attempt for uncovered branches that leaves fewer untaken is not refused as having moved them", async () => {
    const two = [BRANCH, "src/greet.ts:7:10: branch 0 of a conditional expression"];
    const TWO: CheckResult[] = [...PASSING, { name: "coverage", passed: false, output: two.join("\n"), failures: two }];
    const { gate, afterGate, given } = fakes([TWO, TWO, COVERAGE_FAILS, PASSING], "No requirement asks for these branches");

    await gateLoop(2, gate, afterGate);

    expect(given[2]!.failed).not.toMatch(/\bmoved\b/);
  });

  test("an uncovered branch with a failing scenario goes to a code attempt: the code fixes both", async () => {
    const { gate, afterGate, kinds } = fakes([[...SCENARIO_FAILS, COVERAGE_FAILS[3]!], PASSING]);

    await gateLoop(1, gate, afterGate);

    expect(kinds).toEqual(["code"]);
  });

  test("a runner that does not know an option is an error, never sent back", async () => {
    const { gate, afterGate, given } = fakes([UNKNOWN_OPTION, PASSING]);

    const outcome = await gateLoop(2, gate, afterGate);

    expect({ outcome, codeAttempts: given.length }).toEqual({ outcome: { error: expect.stringContaining("noSuchCompilerOption") }, codeAttempts: 0 });
  });
});
