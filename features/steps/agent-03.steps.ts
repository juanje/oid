import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import type { AttemptKind } from "../../src/executor.ts";
import { attemptDir, git, greet02AttemptDir, greet03AttemptDir, scenarioNames } from "../support/fixture.ts";
import { scriptedModel } from "../support/run.ts";
import type { RunWorld } from "../support/world.ts";

/** Each attempt's task, as its agent got it at its first request, with the attempt's kind and scenario. */
function tasksOf(world: RunWorld): { kind: string; scenario: string; task: string }[] {
  const model = scriptedModel(world);
  assert.equal(model.attempts.length, model.script.length, `Expected ${model.script.length} attempts, the model saw ${model.attempts.length}`);
  return model.attempts.map((requests, index) => ({ ...model.script[index]!, task: requests[0]!.task }));
}

/** The body of an FR in the project's SPEC.md, without its heading. */
function frBody(projectDir: string, fr: string): string {
  const spec = readFileSync(join(projectDir, "SPEC.md"), "utf8");
  const heading = spec.split("\n").findIndex((line) => line.startsWith(`#### ${fr}:`));
  assert.notEqual(heading, -1, `No ${fr} in the project's SPEC.md`);
  return spec.split("\n")[heading + 1]!.trim();
}

/** The text of a feature file's steps, without their keywords. */
function stepTexts(projectDir: string, featureFile: string): string[] {
  return readFileSync(join(projectDir, featureFile), "utf8")
    .split("\n")
    .map((line) => /^\s*(?:Given|When|Then|And|But)\s+(.+)$/.exec(line)?.[1])
    .filter((text) => text !== undefined);
}

Then("every attempt's task gives FR-GREET-01's text from SPEC.md and the steps of its scenario", function (this: RunWorld) {
  const body = frBody(this.projectDir, "FR-GREET-01");
  const steps = stepTexts(this.projectDir, "features/greet-01.feature");
  for (const { kind, task } of tasksOf(this)) {
    assert.ok(task.includes(body), `The ${kind} attempt's task does not give FR-GREET-01's text:\n${task}`);
    for (const step of steps) assert.ok(task.includes(step), `The ${kind} attempt's task does not give the step "${step}":\n${task}`);
  }
});

/** A step definition's source in a prepared attempt: the call that defines `pattern`, from its first line to its closing parenthesis. */
function definitionSource(file: string, pattern: string): string {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((line) => line.includes(`("${pattern}"`));
  assert.notEqual(start, -1, `No step definition for "${pattern}" in ${file}`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("});"));
  return [...lines.slice(start, end), "})"].join("\n");
}

Then("the test and code attempts' tasks give the scenario's failure and the source of the step definition it failed in", function (this: RunWorld) {
  // Before the code exists, the scenario fails in its When step: Node cannot find the module the step imports.
  const source = definitionSource(join(attemptDir("steps"), "features/steps/greet.steps.ts"), "I greet {string}");
  const later = tasksOf(this).filter(({ kind }) => kind === "test" || kind === "code");
  assert.equal(later.length, 2, "Expected one test and one code attempt");
  for (const { kind, task } of later) {
    assert.match(task, /Cannot find module[^\n]*src\/greet\.ts/, `The ${kind} attempt's task does not give the scenario's failure:\n${task}`);
    assert.ok(task.includes(source), `The ${kind} attempt's task does not give the source of the step definition it failed in:\n${task}`);
  }
});

const [GREET_02_FIRST, GREET_02_SECOND] = scenarioNames("greet-02/contract/features/greet-02.feature") as [string, string];

Given("the scripted model builds FR-GREET-02", function (this: RunWorld) {
  const build = (scenario: string, prefix: string) =>
    (["steps", "test", "code"] as const).map((kind) => ({ kind, scenario, dir: greet02AttemptDir(`${prefix}-${kind}`) }));
  scriptedModel(this).script = [...build(GREET_02_FIRST, "s1"), ...build(GREET_02_SECOND, "s2")];
});

/** The task of the attempt of `kind` for `scenario`. */
function taskOf(world: RunWorld, kind: string, scenario: string): string {
  const found = tasksOf(world).find((attempt) => attempt.kind === kind && attempt.scenario === scenario);
  assert.ok(found !== undefined, `No ${kind} attempt for "${scenario}"`);
  return found.task;
}

Then(
  "the code attempt for FR-GREET-02's second scenario was given the source its steps import and the unit tests that import that source",
  function (this: RunWorld) {
    const task = taskOf(this, "code", GREET_02_SECOND);
    // When it starts, src/greet-all.ts is as the first scenario's code left it, and two unit tests import it.
    const given = [
      ["src/greet-all.ts", "s1-code"],
      ["tests/greet-all.test.ts", "s1-test"],
      ["tests/greet-list.test.ts", "s2-test"],
    ];
    for (const [file, attempt] of given) {
      assert.ok(task.includes(file!), `The code attempt's task does not name ${file}:\n${task}`);
      assert.ok(task.includes(readFileSync(join(greet02AttemptDir(attempt!), file!), "utf8").trim()), `The code attempt's task does not give ${file}'s source:\n${task}`);
    }
  },
);

/** The patterns of the step definitions in a prepared attempt's files. */
function patternsIn(dir: string, file: string): string[] {
  return [...readFileSync(join(dir, file), "utf8").matchAll(/\b(?:Given|When|Then)\("([^"]+)"/g)].map((match) => match[1]!);
}

Then("each steps attempt was given the patterns of the step definitions the project had when it started", function (this: RunWorld) {
  // FR-GREET-01's steps are built; the second scenario's steps attempt also finds those of the first.
  const greet01 = patternsIn(attemptDir("steps"), "features/steps/greet.steps.ts");
  const expected = new Map([
    [GREET_02_FIRST, greet01],
    [GREET_02_SECOND, [...greet01, ...patternsIn(greet02AttemptDir("s1-steps"), "features/steps/greet-all.steps.ts")]],
  ]);
  for (const [scenario, patterns] of expected) {
    const task = taskOf(this, "steps", scenario);
    for (const pattern of patterns) assert.ok(task.includes(pattern), `The steps attempt for "${scenario}" was not given the pattern "${pattern}":\n${task}`);
  }
});

Given(
  "the scripted model builds FR-GREET-03, its code attempt breaking a scenario of FR-GREET-02 that no unit test covers, and its attempt after the gate fixing it",
  function (this: RunWorld) {
    const scenario = scenarioNames("greet-03/contract/features/greet-03.feature")[0]!;
    const attempt = (kind: AttemptKind, dir: string) => ({ kind, scenario, dir: greet03AttemptDir(dir) });
    scriptedModel(this).script = [attempt("steps", "steps"), attempt("test", "test"), attempt("code", "code-breaks-pair"), attempt("code", "code-fixes-pair")];
  },
);

Then("the code attempt after the gate was given the broken scenario of FR-GREET-02, its steps and its failure", function (this: RunWorld) {
  // FR-GREET-03's code breaks greetPair, which only the first scenario of FR-GREET-02 serves.
  const codeTasks = tasksOf(this).filter(({ kind }) => kind === "code");
  assert.equal(codeTasks.length, 2, "Expected a code attempt and one after the gate");
  const task = codeTasks[1]!.task;
  assert.ok(task.includes(GREET_02_FIRST), `The task does not name the broken scenario:\n${task}`);
  for (const step of ['When I greet "Ada" and "Grace"', 'Then I get "Hello, Ada and Grace!"']) {
    assert.ok(task.includes(step), `The task does not give the broken scenario's step "${step}":\n${task}`);
  }
  assert.match(task, /AssertionError/, `The task does not give the broken scenario's failure:\n${task}`);
});

const DOMAIN_TEXT = "A greeting is one sentence that names everyone it greets.";
const CONVENTIONS_TEXT = "Exported functions are pure, because the scenarios call them directly.";

/** Puts `text` where the project keeps it: a file, a section of SPEC.md, or a file named in .oid.json under `paths`. */
async function keep(dir: string, where: string, text: string, section: string, key: string): Promise<void> {
  const named = /^(\S+), named in \.oid\.json$/.exec(where)?.[1];
  if (where === `the ${section} section of SPEC.md`) {
    await appendFile(join(dir, "SPEC.md"), `\n## ${section}\n\n${text}\n`);
  } else if (named !== undefined) {
    await mkdir(dirname(join(dir, named)), { recursive: true });
    await writeFile(join(dir, named), `${text}\n`);
    const path = join(dir, ".oid.json");
    const config = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
    config.paths = { ...config.paths, [key]: named };
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
  } else {
    await writeFile(join(dir, where), `${text}\n`);
  }
}

Given("the project keeps its domain in {} and its conventions in {}", async function (this: RunWorld, domain: string, conventions: string) {
  await keep(this.projectDir, domain, DOMAIN_TEXT, "Domain", "domain");
  await keep(this.projectDir, conventions, CONVENTIONS_TEXT, "Conventions", "conventions");
  git(this.projectDir, "add", "--all");
  git(this.projectDir, "commit", "-q", "-m", "docs: the project's domain and conventions");
});

Then("every attempt's task gives the project's domain and its conventions", function (this: RunWorld) {
  for (const { kind, task } of tasksOf(this)) {
    assert.ok(task.includes(DOMAIN_TEXT), `The ${kind} attempt's task does not give the project's domain:\n${task}`);
    assert.ok(task.includes(CONVENTIONS_TEXT), `The ${kind} attempt's task does not give the project's conventions:\n${task}`);
  }
});

/** The refusals the gate gave in the run, from its log, whose path the summary names. */
function gateRefusals(world: RunWorld): { failed: string; evidence: string }[] {
  const log = /^\s*Log: (.+\.jsonl)$/m.exec(world.output)?.[1];
  assert.ok(log !== undefined, `The output does not name the run's log:\n${world.output}`);
  return readFileSync(log, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line))
    .filter((event) => event.event === "gate" && event.refusal !== undefined)
    .map((event) => event.refusal);
}

/** Asserts that each of `first` comes before each of `then` in `task`, and that all of them are there. */
function assertBefore(task: string, first: string[], then: string[]): void {
  for (const part of [...first, ...then]) assert.ok(task.includes(part), `The task does not give "${part}":\n${task}`);
  const last = Math.max(...first.map((part) => task.indexOf(part)));
  const earliest = Math.min(...then.map((part) => task.indexOf(part)));
  assert.ok(last < earliest, `The task does not give ${JSON.stringify(first)} before ${JSON.stringify(then)}:\n${task}`);
}

/** The opening paragraph of a task. */
const opener = (task: string): string => task.split("\n\n")[0]!;

Given("the scripted model builds FR-GREET-03, its steps attempt leaving a type error that no test catches, and its steps attempt after the gate fixing it", function (this: RunWorld) {
  const scenario = scenarioNames("greet-03/contract/features/greet-03.feature")[0]!;
  const attempt = (kind: AttemptKind, dir: string) => ({ kind, scenario, dir: greet03AttemptDir(dir) });
  scriptedModel(this).script = [attempt("steps", "steps-type-error"), attempt("test", "test"), attempt("code", "code"), attempt("steps", "steps")];
  this.repairs = [3];
});

Then("the steps attempt after the gate was given its job and the gate's type error before FR-GREET-03's text and its scenario's steps", function (this: RunWorld) {
  const task = tasksOf(this).filter(({ kind }) => kind === "steps")[1]!.task;
  const [refusal] = gateRefusals(this);
  assert.ok(refusal !== undefined, "The gate refused nothing");
  assert.ok(opener(task).includes(refusal.failed), `The task does not open with what the gate refused, "${refusal.failed}":\n${task}`);
  const steps = stepTexts(this.projectDir, "features/greet-03.feature");
  assertBefore(task, ["error TS"], [frBody(this.projectDir, "FR-GREET-03"), steps[0]!]);
});

const ASKED_REASON = "The scenario fails in the shared Then step, which checks the greeting of the name the When step kept";

Given("the scripted model builds FR-GREET-02, its first scenario's code attempt asking for a steps attempt, which fixes the shared Then step", function (this: RunWorld) {
  const [first, second] = scenarioNames("greet-02/contract/features/greet-02.feature") as [string, string];
  const attempt = (kind: AttemptKind, scenario: string, dir: string) => ({ kind, scenario, dir });
  scriptedModel(this).script = [
    attempt("steps", first, greet02AttemptDir("s1-steps")),
    attempt("test", first, greet02AttemptDir("s1-test")),
    { ...attempt("code", first, greet02AttemptDir("s1-code")), next: { kind: "steps", reason: ASKED_REASON } },
    attempt("steps", first, attemptDir("steps")),
    attempt("steps", second, greet02AttemptDir("s2-steps")),
    attempt("test", second, greet02AttemptDir("s2-test")),
    attempt("code", second, greet02AttemptDir("s2-code")),
  ];
  this.repairs = [3];
});

Then("the steps attempt asked for was given its job, the code attempt's reason and the scenario's failure before FR-GREET-02's text and its scenario's steps", function (this: RunWorld) {
  const task = tasksOf(this).filter(({ kind }) => kind === "steps")[1]!.task;
  assert.match(opener(task), /\bcode\b/, `The task does not open with the code attempt's request:\n${task}`);
  const steps = stepTexts(this.projectDir, "features/greet-02.feature");
  assertBefore(task, [ASKED_REASON, "AssertionError"], [frBody(this.projectDir, "FR-GREET-02"), steps[0]!]);
});

Given("the scripted model builds FR-GREET-01, its first test attempt writing a test that passes without its code", function (this: RunWorld) {
  const scenario = scenarioNames("project/features/greet-01.feature")[0]!;
  const attempt = (kind: AttemptKind, dir: string) => ({ kind, scenario, dir: attemptDir(dir) });
  scriptedModel(this).script = [attempt("steps", "steps"), attempt("test", "test-passes-without-code"), attempt("test", "test"), attempt("code", "code")];
});

Then("every other attempt's task opens with its kind's usual work, before any refusal", function (this: RunWorld) {
  const others = tasksOf(this).filter((_, index) => !this.repairs.includes(index));
  assert.ok(others.length > 0, "No other attempt to check");
  for (const { kind, task } of others) {
    assert.match(opener(task), new RegExp(`\\b${kind}\\b`), `The ${kind} attempt's task does not open with its kind's work:\n${task}`);
    const refused = task.indexOf("Refused: ");
    if (refused !== -1) assert.ok(task.indexOf(frBody(this.projectDir, frOf(task))) < refused, `The ${kind} attempt's task gives a refusal before its FR:\n${task}`);
  }
});

/** The FR a task names in its opening. */
function frOf(task: string): string {
  const fr = /\bFR-[A-Z]+-\d+\b/.exec(opener(task))?.[0];
  assert.ok(fr !== undefined, `The task's opening names no FR:\n${task}`);
  return fr;
}
