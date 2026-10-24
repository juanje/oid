import { describe, expect, test } from "vitest";
import { judgeReport } from "../../src/report.ts";

const SCENARIO = "A person is greeted by name";

describe("judgeReport", () => {
  test("accepts an attempt that reported its result", () => {
    expect(judgeReport("code", SCENARIO, "greet returns the greeting")).toBeUndefined();
  });

  test("refuses an attempt that ended without a report, naming it", () => {
    const refusal = judgeReport("code", SCENARIO, undefined);

    expect(refusal?.evidence).toContain("code attempt");
    expect(refusal?.evidence).toContain(SCENARIO);
  });

  test("refuses an attempt whose report gives no result", () => {
    expect(judgeReport("test", SCENARIO, "   ")?.evidence).toContain("test attempt");
  });
});
