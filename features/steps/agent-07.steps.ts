import { Given, Then } from "@cucumber/cucumber";
import { GREET_01_SCENARIO } from "../support/fixture.ts";
import { assertOutputNames } from "../support/run.ts";
import type { RunWorld } from "../support/world.ts";

/** The code attempt ends with `report`, and the run asks for nothing after it. */
function codeReports(world: RunWorld, report: string | null): void {
  world.script = world.script.map((attempt) => (attempt.kind === "code" ? { ...attempt, report } : attempt));
}

Given("the scripted code attempt ends without a report", function (this: RunWorld) {
  codeReports(this, null);
});

Given("the scripted code attempt ends with a report whose result is empty", function (this: RunWorld) {
  codeReports(this, "  ");
});

for (const ending of ["no report", "no result"]) {
  Then(`the output names the code attempt that gave ${ending}`, function (this: RunWorld) {
    assertOutputNames(this, "code attempt");
    assertOutputNames(this, GREET_01_SCENARIO);
  });
}
