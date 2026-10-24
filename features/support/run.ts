import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { branches, git } from "./fixture.ts";
import type { Executor } from "../../src/executor.ts";
import type { AttemptEvent, LogEvent } from "../../src/run-log.ts";
import type { PreparedAttempt, Request } from "./scripted-executor.ts";
import type { ScriptedModel } from "./scripted-model.ts";
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
/** As the CLI takes it: an executor, or how to make one once the command is valid. */
type CliExecutor = Executor | (() => Promise<Executor>);

export async function runOid(projectDir: string, args: string[], executor: CliExecutor): Promise<OidRun> {
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

/** The run's log: the one file in the repository's .git/oid/runs. */
export async function runLog(world: RunWorld): Promise<LogEvent[]> {
  const dir = join(world.projectDir, ".git/oid/runs");
  // The logs, without the directories of transcripts beside them.
  const logs = (await readdir(dir).catch(() => [])).filter((name) => name.endsWith(".jsonl"));
  assert.equal(logs.length, 1, `Expected one run log in ${dir}, found ${logs.length}`);
  return (await readFile(join(dir, logs[0]!), "utf8"))
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as LogEvent);
}

export const attemptsIn = (log: LogEvent[]) => log.filter((entry): entry is AttemptEvent => entry.event === "attempt");

/** The scripted model the run's Pi executor answers from. */
export function scriptedModel(world: RunWorld): ScriptedModel {
  assert.ok(world.model !== undefined, "No scripted model");
  return world.model;
}

/** Notes the project's HEAD and branches before a run, which the steps after it compare against. */
export function noteBeforeRun(world: RunWorld): void {
  world.startHead = git(world.projectDir, "rev-parse", "HEAD");
  world.branchesBefore = branches(world.projectDir);
}

/** This scenario's own personal config dir, made on first use: a run in a scenario never reads the person's. */
export function configDirOf(world: RunWorld): string {
  world.configDir ??= mkdtempSync(join(tmpdir(), "oid-config-"));
  return world.configDir;
}
