import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import type { AttemptKind, PathsKind } from "../../src/executor.ts";
import { createGreetProjectWith, greet03AttemptDir, scenarioNames, typeCheckAt } from "../support/fixture.ts";
import { assertOutputNames, requestsOf, runBranch, runLog } from "../support/run.ts";
import type { PreparedAttempt } from "../support/scripted-executor.ts";
import type { RunWorld } from "../support/world.ts";

// The FR-GREET-02 scenario that only greetPair serves, which no unit test covers.
const [BROKEN] = scenarioNames("greet-02/contract/features/greet-02.feature") as [string];

/** The script with FR-GREET-03's code attempt breaking greetPair, then the code attempt after the gate answered by `after`. */
function codeThenAfterGate(script: PreparedAttempt[], after: string): PreparedAttempt[] {
  return script.flatMap((attempt) =>
    attempt.kind === "code" ? [{ ...attempt, dir: greet03AttemptDir("code-breaks-pair") }, { ...attempt, dir: greet03AttemptDir(after) }] : [attempt],
  );
}

Given("a project where FR-GREET-01 and FR-GREET-02 are built and FR-GREET-03 has an approved feature file", async function (this: RunWorld) {
  this.projectDir = await createGreetProjectWith("greet-03", { greet02Built: true });
});

Given(
  "the scripted code attempt for FR-GREET-03 breaks a scenario of FR-GREET-02 that no unit test covers, and its retry does not",
  function (this: RunWorld) {
    this.script = codeThenAfterGate(this.script, "code-fixes-pair");
  },
);

Given(
  "the scripted code attempt for FR-GREET-03 breaks a scenario of FR-GREET-02 that no unit test covers, and so does its retry",
  function (this: RunWorld) {
    this.script = codeThenAfterGate(this.script, "code-breaks-pair");
  },
);

Then("the retried code attempt was given the gate's failure, naming the scenario of FR-GREET-02 it broke", function (this: RunWorld) {
  const refusal = requestsOf(this, "code", 2)[1]!.refusal;
  assert.ok(refusal !== undefined, "The code attempt after the gate came without the gate's refusal");
  // The task's focus is the scenario the gate found failing, not the scenario the attempt belongs to.
  assert.deepEqual(
    refusal.focus?.scenarios.map((scenario) => scenario.name),
    [BROKEN],
    `The refusal's focus is not the broken scenario:\n${JSON.stringify(refusal)}`,
  );
  assert.ok(refusal.evidence.includes(BROKEN), `The refusal's evidence does not name "${BROKEN}"`);
});

Then("the output names the scenario of FR-GREET-02 that fails", function (this: RunWorld) {
  assertOutputNames(this, BROKEN);
});

/** For each kind, its prepared attempt with a type error no test catches, and the file the error is in. */
const TYPE_ERRORS: Record<PathsKind, { dir: string; file: string }> = {
  code: { dir: "code-type-error", file: "src/greet.ts" },
  test: { dir: "test-type-error", file: "tests/greet-with.test.ts" },
  steps: { dir: "steps-type-error", file: "features/steps/greet-with.steps.ts" },
};

Given(
  "the scripted {word} attempt for FR-GREET-03 leaves a type error in {} that no test catches, and its attempt after the gate fixes it",
  function (this: RunWorld, kind: PathsKind, _file: string) {
    const withError = this.script.map((attempt) => (attempt.kind === kind ? { ...attempt, dir: greet03AttemptDir(TYPE_ERRORS[kind].dir) } : attempt));
    const fix = this.script.find((attempt) => attempt.kind === kind)!;
    this.script = [...withError, fix];
  },
);

Then("the {word} attempt after the gate was given the type error, naming its file", function (this: RunWorld, kind: PathsKind) {
  const refusal = requestsOf(this, kind, 2)[1]!.refusal;
  assert.ok(refusal !== undefined, `The ${kind} attempt after the gate came without the gate's refusal`);
  assert.ok(refusal.evidence.includes(TYPE_ERRORS[kind].file), `The refusal's evidence does not name ${TYPE_ERRORS[kind].file}:\n${refusal.evidence}`);
});

Then("the type check passes on the run's branch", async function (this: RunWorld) {
  const { exitCode, output } = await typeCheckAt(this.projectDir, runBranch(this));
  assert.equal(exitCode, 0, `The type check fails on the run's branch:\n${output}`);
});

Then("the run's log counts the gate's refusal as a rejection of the {word} attempt", async function (this: RunWorld, kind: AttemptKind) {
  const log = await runLog(this);
  const refused = log.filter((event) => event.event === "gate" && event.verdict === "refused");
  assert.ok(
    refused.some((event) => event.event === "gate" && event.sendTo === kind),
    `The run's log has no gate refusal sent to a ${kind} attempt:\n${JSON.stringify(refused)}`,
  );
  const end = log.find((event) => event.event === "end");
  assert.ok(end?.event === "end", "The run's log has no measures");
  assert.equal(end.measures.rejections[kind], 1, `The run's measures do not count the gate's refusal as a ${kind} rejection: ${JSON.stringify(end.measures.rejections)}`);
});
