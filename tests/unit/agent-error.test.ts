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

describe("a provider error that may pass", () => {
  test("a transient error, such as an overload or a dropped stream, may pass, and oid retries the attempt once", () => {
    for (const message of [PROVIDER_ERROR, "500 api_error: Internal server error", "terminated", "Connection error."]) {
      expect(agentError("code", SCENARIO, { turns: 1, stoppedAtLimit: false, error: message })?.passes).toBe(true);
    }
  });

  test("an error of credentials, billing or quota does not pass by trying again", () => {
    for (const message of [
      "400 invalid_request_error: Your credit balance is too low to access the API. Please go to Plans & Billing to upgrade or purchase credits.",
      "429 insufficient_quota: You exceeded your current quota, please check your plan and billing details.",
      "401 authentication_error: invalid x-api-key",
      "403 permission_error: Your API key does not have permission to use the specified resource.",
      "400 invalid_request_error: You're out of extra usage. Add more at claude.ai/settings/usage and keep going.",
    ]) {
      expect(agentError("code", SCENARIO, { turns: 1, stoppedAtLimit: false, error: message })?.passes).toBe(false);
    }
  });
});
