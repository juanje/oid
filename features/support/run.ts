import assert from "node:assert/strict";
import { branches } from "./fixture.ts";
import type { PreparedAttempt } from "./scripted-executor.ts";
import type { RunWorld } from "./world.ts";

/** The one branch the run created. */
export function runBranch(world: RunWorld): string {
  const created = branches(world.projectDir).filter((branch) => !world.branchesBefore.includes(branch));
  assert.equal(created.length, 1, `Expected the run to create one branch, it created: ${created.join(", ") || "none"}`);
  return created[0]!;
}

/** The last prepared attempt of `kind`: the one a refusal is about. */
export function attemptOf(script: PreparedAttempt[], kind: PreparedAttempt["kind"]): PreparedAttempt {
  const attempt = [...script].reverse().find((prepared) => prepared.kind === kind);
  assert.ok(attempt !== undefined, `No prepared ${kind} attempt`);
  return attempt;
}

/** Checks that the run's output names `name`, without pinning the wording around it. */
export function assertOutputNames(world: RunWorld, name: string | undefined): void {
  assert.ok(name !== undefined, "Nothing to look for in the output");
  assert.ok(world.output.includes(name), `The output does not name "${name}":\n${world.output}`);
}
