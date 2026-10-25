import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import type { Mutant } from "../../src/executor.ts";
import { greet02AttemptDir, scenarioNames } from "../support/fixture.ts";
import type { RunWorld } from "../support/world.ts";

const [FIRST, SECOND] = scenarioNames("greet-02/contract/features/greet-02.feature") as [string, string];
const NEW_TEST = "greets three people as a list";

// Each mutant is edits to the second scenario's code, as the first scenario's code attempt left it (s2-code).
const JOIN_ALL: Mutant = {
  reason: "The list already has its commas: joining every name with and breaks it",
  files: [{ path: "src/greet-all.ts", edits: [{ oldText: 'return `Hello, ${rest.join(", ")} and ${last}!`;', newText: 'return `Hello, ${names.join(" and ")}!`;' }] }],
};
const REMOVE_GREET_ALL: Mutant = {
  reason: "Without greetAll there is no list",
  files: [
    {
      path: "src/greet-all.ts",
      edits: [
        {
          oldText: 'export function greetAll(names: string[]): string {\n  const last = names[names.length - 1];\n  const rest = names.slice(0, -1);\n  return `Hello, ${rest.join(", ")} and ${last}!`;\n}\n',
          newText: "",
        },
      ],
    },
  ],
};
const EDIT_STEPS: Mutant = {
  reason: "Greet the names in another order",
  files: [{ path: "features/steps/greet-all.steps.ts", edits: [{ oldText: "greetAll([first, second, third])", newText: "greetAll([third, second, first])" }] }],
};
const UNRUN: Mutant = {
  reason: "Swap the pair",
  files: [{ path: "src/greet-all.ts", edits: [{ oldText: "return greetAll([first, second]);", newText: "return greetAll([second, first]);" }] }],
};

Given("the scripted code attempt for the first scenario of FR-GREET-02 also builds the second scenario's behaviour", function (this: RunWorld) {
  this.script = [
    { kind: "steps", scenario: FIRST, dir: greet02AttemptDir("s1-steps") },
    { kind: "test", scenario: FIRST, dir: greet02AttemptDir("s1-test") },
    // The second scenario's code: a list with commas, which the second scenario asks for.
    { kind: "code", scenario: FIRST, dir: greet02AttemptDir("s2-code") },
  ];
});

const MUTANTS: Record<string, Mutant> = {
  "joins every name with and": JOIN_ALL,
  "removes the greeting function": REMOVE_GREET_ALL,
  "edits its own step definitions": EDIT_STEPS,
  "changes code the scenario does not run": UNRUN,
};

Given("the scripted steps attempt for the second scenario submits a mutant that {}", function (this: RunWorld, what: string) {
  const mutant = MUTANTS[what];
  assert.ok(mutant !== undefined, `No mutant that ${what}`);
  this.script = [...this.script, { kind: "steps", scenario: SECOND, dir: greet02AttemptDir("s2-steps"), mutant }];
});

Given("the scripted steps attempt for the second scenario asks for a function that does not exist yet", function (this: RunWorld) {
  this.script = [...this.script, { kind: "steps", scenario: SECOND, dir: greet02AttemptDir("s2-steps-list") }];
});

Given(
  "the scripted test attempt for the second scenario writes a test of behaviour that exists already, and submits a mutant that joins every name with and",
  function (this: RunWorld) {
    this.script = [
      ...this.script,
      { kind: "test", scenario: SECOND, dir: greet02AttemptDir("s2-test"), mutant: JOIN_ALL },
      { kind: "code", scenario: SECOND, dir: greet02AttemptDir("s2-code-list") },
    ];
  },
);

/** Asserts that a line of the output names `what` with every one of the fixed `words`. */
function assertLineWith(world: RunWorld, what: string, words: string[]): void {
  const line = world.output.split("\n").find((text) => text.includes(what) && words.every((word) => new RegExp(`\\b${word}\\b`).test(text)));
  assert.ok(line !== undefined, `No line of the output names "${what}" with ${words.join(", ")}:\n${world.output}`);
}

Then("the output gives the second scenario's Red the class business_assertion, through a mutant", function (this: RunWorld) {
  assertLineWith(this, `"${SECOND}"`, ["business_assertion", "mutant"]);
});

Then("the output gives the new test's Red the class business_assertion, through a mutant", function (this: RunWorld) {
  assertLineWith(this, NEW_TEST, ["business_assertion", "mutant"]);
});

/** The refusal the run stopped with, without the summary after it. */
function finalRefusal(world: RunWorld): string {
  const refusal = world.output.slice(world.output.lastIndexOf("Refused: "));
  return refusal.slice(0, refusal.includes("\nSummary of ") ? refusal.indexOf("\nSummary of ") : undefined);
}

Then("the output names the mutant's failure as missing_implementation", function (this: RunWorld) {
  assert.match(finalRefusal(this), /\bmissing_implementation\b/, `The refusal does not name missing_implementation:\n${this.output}`);
});

Then("the output names the step definition file the mutant edits", function (this: RunWorld) {
  assert.ok(finalRefusal(this).includes("features/steps/greet-all.steps.ts"), `The refusal does not name the step definition file:\n${this.output}`);
});

Then("the output says the scenario still passes under the mutant", function (this: RunWorld) {
  const refusal = finalRefusal(this);
  assert.ok(refusal.includes(SECOND) && /\bmutant\b/.test(refusal) && /\bpass/.test(refusal), `The refusal does not say the scenario still passes under the mutant:\n${this.output}`);
});
