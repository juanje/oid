import { describe, expect, test } from "vitest";
import { toolDescription } from "../../src/agent-tools.ts";

describe("toolDescription", () => {
  test("tells the model that try runs the type check only once its target passes", () => {
    const clauses = toolDescription("try").split(/[;.]/);

    expect(clauses.some((clause) => /\bpass/.test(clause) && /\btype check\b/.test(clause))).toBe(true);
  });
});
