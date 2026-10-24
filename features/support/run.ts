import assert from "node:assert/strict";
import { branches } from "./fixture.ts";
import type { Executor } from "../../src/executor.ts";
import type { PreparedAttempt, Request } from "./scripted-executor.ts";
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

/** The executor's requests for attempts of `kind`, in order, checking there were `count` of them. */
export function requestsOf(world: RunWorld, kind: PreparedAttempt["kind"], count: number): Request[] {
  const requests = world.executor?.requests.filter((request) => request.kind === kind) ?? [];
  assert.equal(requests.length, count, `Expected ${count} ${kind} attempts, got ${requests.length}`);
  return requests;
}

export interface OidRun {
  exitCode: number | undefined;
  output: string;
  crash: unknown;
}

/** Runs oid's command line in-process on `projectDir` with `executor`, as the person would run `oid <args>`. */
export async function runOid(projectDir: string, args: string[], executor: Executor): Promise<OidRun> {
  // A dynamic import, so that a missing CLI fails the step and not the whole load.
  const { runCli } = await import("../../src/cli.ts");
  const result: OidRun = { exitCode: undefined, output: "", crash: undefined };
  const write = (text: string): void => {
    result.output += text;
  };
  try {
    result.exitCode = await runCli(args, { cwd: projectDir, executor, stdout: write, stderr: write });
  } catch (error) {
    result.crash = error;
  }
  return result;
}
