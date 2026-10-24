/**
 * The runners oid runs a project's unit tests and scenarios with, and what a file must import from them to be run.
 * The checks call them from here, and the prompts of the agents that write those files state them from here, so the
 * two cannot differ (NFR-04).
 */
export const RUNNERS = {
  unit: { bin: "vitest", module: "vitest", imports: ["describe", "it", "test", "expect"], files: "unit tests" },
  scenarios: { bin: "cucumber-js", module: "@cucumber/cucumber", imports: ["Given", "When", "Then"], files: "step definitions" },
} as const;

/** What an agent is told of the runner that runs the files it writes. */
export function runnerText(runner: (typeof RUNNERS)[keyof typeof RUNNERS]): string {
  return `oid runs ${runner.files} with ${runner.bin}: they use ${runner.imports.join(", ")}, imported from "${runner.module}". A file ${runner.bin} does not run counts for nothing.`;
}
