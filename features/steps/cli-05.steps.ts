import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO } from "../support/fixture.ts";
import type { RunWorld } from "../support/world.ts";

// The progress lines' fixed words (DOMAIN.md, Progress lines): "stage <name>:", "attempt <kind> for "<scenario>"", and
// after an attempt its verdict; a Red says "Red of the scenario" or "Red of a unit test", and ends with its class.
const STAGE = /^stage ([a-z ]+):/;
const ATTEMPT = /^attempt (steps|test|code) for "([^"]*)"(?:(: )(accepted|refused|stopped)\b)?/;

/** The output's progress lines, in order, each as the stage or attempt it marks. */
interface Milestone {
  stage?: string;
  attempt?: string;
  scenario?: string;
  verdict?: string;
}

function milestones(world: RunWorld): Milestone[] {
  return world.output.split("\n").flatMap((line): Milestone[] => {
    const stage = STAGE.exec(line);
    if (stage !== null) return [{ stage: stage[1]! }];
    const attempt = ATTEMPT.exec(line);
    if (attempt !== null) return [{ attempt: attempt[1]!, scenario: attempt[2]!, ...(attempt[4] === undefined ? {} : { verdict: attempt[4] }) }];
    return [];
  });
}

function stagesAround(world: RunWorld): { before: string[]; after: string[] } {
  const lines = milestones(world);
  const first = lines.findIndex((line) => line.attempt !== undefined);
  const last = lines.length - 1 - [...lines].reverse().findIndex((line) => line.attempt !== undefined);
  assert.notEqual(first, -1, `The output shows no attempt:\n${world.output}`);
  const names = (part: typeof lines) => part.flatMap((line) => (line.stage === undefined ? [] : [line.stage]));
  return { before: names(lines.slice(0, first)), after: names(lines.slice(last + 1)) };
}

Then("the output shows the stages agent, worktree, scenarios and unit tests starting, in that order, before the first attempt", function (this: RunWorld) {
  assert.deepEqual(stagesAround(this).before, ["agent", "worktree", "scenarios", "unit tests"], `The stages before the first attempt:\n${this.output}`);
});

Then("the output shows the stages gate and commit starting, in that order, after the last attempt", function (this: RunWorld) {
  assert.deepEqual(stagesAround(this).after, ["gate", "commit"], `The stages after the last attempt:\n${this.output}`);
});

Then("the output shows each attempt start and end, in order: steps accepted, test accepted, code refused, code accepted", function (this: RunWorld) {
  const attempts = milestones(this).filter((line) => line.attempt !== undefined);
  for (const attempt of attempts) assert.equal(attempt.scenario, GREET_01_SCENARIO, "An attempt line does not name its scenario");
  const shown = attempts.map((line) => `${line.attempt} ${line.verdict ?? "starts"}`);
  const expected = ["steps accepted", "test accepted", "code refused", "code accepted"].flatMap((end) => [`${end.split(" ")[0]} starts`, end]);
  assert.deepEqual(shown, expected, `The attempts the output shows:\n${this.output}`);
});

Then("the output gives the scenario's Red with the class {word}", function (this: RunWorld, red: string) {
  const line = this.output.split("\n").find((text) => /\bRed of the scenario\b/.test(text) && text.trimEnd().endsWith(`: ${red}`));
  assert.ok(line !== undefined, `The output gives no Red of the scenario with the class ${red}:\n${this.output}`);
});

Then("the output gives a unit test's Red with the class {word}", function (this: RunWorld, red: string) {
  const line = this.output.split("\n").find((text) => /\bRed of a unit test\b/.test(text) && text.trimEnd().endsWith(`: ${red}`));
  assert.ok(line !== undefined, `The output gives no Red of a unit test with the class ${red}:\n${this.output}`);
});
