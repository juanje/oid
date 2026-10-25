import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StepFailure } from "./cucumber-messages.ts";
import type { AttemptKind, TaskContext } from "./executor.ts";
import { frText, projectTexts } from "./project-texts.ts";
import { relevantCode } from "./relevant-code.ts";
import type { ScenarioRun } from "./scenarios.ts";
import { definitionSource, stepPatterns } from "./step-definitions.ts";

/** How much relevant code a task gives, in characters (FR-AGENT-03). */
const CODE_BUDGET = 40_000;

/** What every task of an FR's run shares: the FR's text and the project's domain and conventions. */
export type FrTexts = Pick<TaskContext, "fr" | "domain" | "conventions">;

export async function frTexts(dir: string, fr: string): Promise<FrTexts> {
  const spec = existsSync(join(dir, "SPEC.md")) ? frText(await readFile(join(dir, "SPEC.md"), "utf8"), fr) : undefined;
  return { ...(spec === undefined ? {} : { fr: spec }), ...(await projectTexts(dir)) };
}

/**
 * What the task gives an attempt (FR-AGENT-03): the FR's texts and its scenario's steps; to a steps attempt, the step
 * patterns the project has; to a later attempt, once the steps have run, where the scenario fails now and the code
 * relevant to it.
 */
export async function taskContext(
  dir: string,
  kind: AttemptKind,
  shared: FrTexts,
  steps: string[],
  latest: ScenarioRun | undefined,
  { asked = false }: { asked?: boolean } = {},
): Promise<TaskContext> {
  // A steps attempt another one asked for gets the failure it is asked to fix (FR-RUN-04); the first one has none.
  if (kind === "steps") {
    const failure = asked && latest?.failure !== undefined ? { failure: await failureContext(dir, latest.failure) } : {};
    return { ...shared, steps, ...failure, patterns: await stepPatterns(dir) };
  }
  const stepFiles = latest?.stepFiles ?? [];
  return {
    ...shared,
    steps,
    ...(latest?.failure === undefined ? {} : { failure: await failureContext(dir, latest.failure) }),
    ...(stepFiles.length === 0 ? {} : { code: await relevantCode(dir, stepFiles, CODE_BUDGET) }),
  };
}

/**
 * A failure's message without the stack frames of Node and the packages, which cost tokens and point nowhere the agent
 * can change: its text, and the first frame in a file of the project in `dir`.
 */
export function trimmedMessage(message: string, dir: string): string {
  const lines = message.split("\n");
  const isFrame = (line: string) => /^\s+at /.test(line);
  const text = lines.filter((line) => !isFrame(line));
  const own = lines.find((line) => isFrame(line) && line.includes(`${dir}/`) && !line.includes("/node_modules/"));
  return [...text, ...(own === undefined ? [] : [own])].join("\n").trimEnd();
}

async function failureContext(dir: string, { step, message: full, definedIn, definedAt }: StepFailure): Promise<NonNullable<TaskContext["failure"]>> {
  const message = trimmedMessage(full, dir);
  if (definedIn === undefined || definedAt === undefined) return { step, message };
  const source = definitionSource(await readFile(join(dir, definedIn), "utf8"), definedAt);
  return { step, message, ...(source === undefined ? {} : { definition: { file: definedIn, line: definedAt, source } }) };
}
