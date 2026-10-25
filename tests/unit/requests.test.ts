import { describe, expect, test } from "vitest";
import { changesNextKind } from "../../src/requests.ts";

describe("changesNextKind", () => {
  test("is false for code asked for by a steps or a test attempt, which comes next in their round anyway, and true for any other request", () => {
    expect([changesNextKind("steps", "code"), changesNextKind("test", "code")]).toEqual([false, false]);
    expect([changesNextKind("code", "steps"), changesNextKind("code", "test"), changesNextKind("test", "steps"), changesNextKind("steps", "test")]).toEqual([true, true, true, true]);
  });
});
