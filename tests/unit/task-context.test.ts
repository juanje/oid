import { describe, expect, test } from "vitest";
import { taskContext, trimmedMessage } from "../../src/task-context.ts";
import { tempRepo } from "./support/repo.ts";

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

describe("taskContext", () => {
  test("gives a steps attempt the scenario's failure only when another attempt asked for it: the first one has none to read", async () => {
    const dir = await tempRepo({ "features/steps/greet.steps.ts": 'import { Then } from "@cucumber/cucumber";\nThen("I get {string}", () => {});\n' });
    const latest = {
      uri: "features/greet-02.feature",
      line: 4,
      name: "Two people are greeted together",
      status: "failed" as const,
      failure: { step: 'I get "Hello, Ada and Grace!"', kind: "Outcome" as const, status: "FAILED", message: "AssertionError: 'Hello, !' !== 'Hello, Ada and Grace!'" },
    };

    const first = await taskContext(dir, "steps", {}, [], latest);
    const asked = await taskContext(dir, "steps", {}, [], latest, { asked: true });

    expect({ first: first.failure, asked: asked.failure?.step }).toEqual({ first: undefined, asked: 'I get "Hello, Ada and Grace!"' });
  });
});
