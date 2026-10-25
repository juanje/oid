import { describe, expect, test } from "vitest";
import { refutedRefusal, whenCodeRunsOut } from "../../src/provisional.ts";

const TEST = "tests/greet-with.test.ts > greets a person with the chosen salutation";
const OTHER = "tests/greet.test.ts > greets a person by name";
const SCENARIO = 'features/greet-03.feature:4 "A person is greeted with the chosen salutation"';

describe("whenCodeRunsOut", () => {
  test("sends a provisional test the code never made pass to one repair", () => {
    expect(whenCodeRunsOut({ tests: [TEST] }, new Set(), [TEST, OTHER])).toEqual({ repair: [TEST] });
  });

  test("refutes a provisional test that is still failing after its repair: one repair per test and run", () => {
    expect(whenCodeRunsOut({ tests: [TEST] }, new Set([TEST]), [TEST])).toEqual({ refuted: [TEST] });
  });

  test("refutes a provisional scenario when the code attempts ran out on failing tests, provisional or not", () => {
    expect(whenCodeRunsOut({ tests: [], scenario: SCENARIO }, new Set(), [OTHER])).toEqual({ refuted: [SCENARIO] });
  });

  test("settles nothing when the code attempts stopped for another reason, or nothing was provisional", () => {
    expect(whenCodeRunsOut({ tests: [TEST], scenario: SCENARIO }, new Set(), undefined)).toBeUndefined();
    expect(whenCodeRunsOut({ tests: [] }, new Set(), [OTHER])).toBeUndefined();
  });
});

describe("refutedRefusal", () => {
  test("goes back to a test attempt for a test, naming it as refuted with its failure, and says what oid needs to see", () => {
    const refusal = refutedRefusal("tests", [`${TEST}: Error: greetWith is not there yet`]);

    expect(refusal.failed).toMatch(/\brefuted\b/);
    expect(refusal.evidence).toBe(`${TEST}: Error: greetWith is not there yet`);
    expect(refusal.next).toMatch(/^oid needs a test .*src\//);
    expect(refusal.sendTo).toBe("test");
  });

  test("names a scenario as refuted, for the run to stop on", () => {
    const refusal = refutedRefusal("scenario", [SCENARIO]);

    expect(refusal.failed).toMatch(/\brefuted\b/);
    expect(refusal.evidence).toBe(SCENARIO);
    expect(refusal.sendTo).toBeUndefined();
  });
});
