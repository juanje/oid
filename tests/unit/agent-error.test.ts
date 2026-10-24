import { describe, expect, test } from "vitest";
import { AgentError, agentError } from "../../src/agent-error.ts";

const SCENARIO = "A person is greeted by name";
const PROVIDER_ERROR = "529 overloaded_error: Overloaded";

describe("agentError", () => {
  test("an attempt whose executor reports an error stopped on it", () => {
    const error = agentError("code", SCENARIO, { turns: 3, stoppedAtLimit: false, error: PROVIDER_ERROR });

    expect(error).toBeInstanceOf(AgentError);
    expect(error?.message).toContain(PROVIDER_ERROR);
    expect(error?.message).toContain("code attempt");
    expect(error?.message).toContain(SCENARIO);
  });

  test("an attempt that ended without an error did not", () => {
    expect(agentError("code", SCENARIO, { turns: 3, stoppedAtLimit: false })).toBeUndefined();
  });
});
