import { describe, expect, test } from "vitest";
import { toolDescription } from "../../src/agent-tools.ts";

describe("toolDescription", () => {
  test("tells the model that try runs the type check only once its target passes", () => {
    const clauses = toolDescription("try").split(/[;.]/);

    expect(clauses.some((clause) => /\bpass/.test(clause) && /\btype check\b/.test(clause))).toBe(true);
  });

  test("tells the model that report can name the branches no requirement asks for as unasked, each with its reason", () => {
    const clauses = toolDescription("report").split(/;/);

    expect(clauses.some((clause) => /\bunasked\b/.test(clause) && /\bbranch/.test(clause) && /\breason\b/.test(clause))).toBe(true);
  });
});
