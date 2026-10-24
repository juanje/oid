import { describe, expect, test } from "vitest";
import { trimmedMessage } from "../../src/task-context.ts";

const DIR = "/tmp/.oid-worktrees/greet/FR-GREET-01-1";

describe("trimmedMessage", () => {
  test("keeps the message and the first frame in a project file, without the frames of Node or the packages", () => {
    const message = [
      "AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:",
      "",
      "'Hello, Ada and Grace' !== 'Hello, Ada, Grace'",
      "    at assertEqual (node:internal/assert:12:3)",
      `    at RunWorld.<anonymous> (${DIR}/node_modules/@cucumber/cucumber/lib/x.js:4:1)`,
      `    at RunWorld.<anonymous> (file://${DIR}/features/steps/greet.steps.ts:15:10)`,
      `    at ${DIR}/src/greet.ts:3:7`,
    ].join("\n");

    expect(trimmedMessage(message, DIR)).toBe(
      [
        "AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:",
        "",
        "'Hello, Ada and Grace' !== 'Hello, Ada, Grace'",
        `    at RunWorld.<anonymous> (file://${DIR}/features/steps/greet.steps.ts:15:10)`,
      ].join("\n"),
    );
  });

  test("keeps only the message when no frame is in a project file", () => {
    const message = `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '${DIR}/src/greet.ts'\n    at finalizeResolution (node:internal/modules/esm/resolve:271:11)\n    at resolve (file:///Users/x/node_modules/tsx/dist/register.mjs:2:1)`;

    expect(trimmedMessage(message, DIR)).toBe(`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '${DIR}/src/greet.ts'`);
  });
});
