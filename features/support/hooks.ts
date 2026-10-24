import { AfterAll, Before, setDefaultTimeout } from "@cucumber/cucumber";

// Each scenario runs oid on a fixture project with real git, tsc, vitest and cucumber-js.
setDefaultTimeout(180_000);

let scenariosRun = 0;

Before(() => {
  scenariosRun += 1;
});

// cucumber-js exits 0 when no scenario ran, and a check that ran no test must fail (AGENTS.md, Gate).
AfterAll(() => {
  if (scenariosRun === 0) throw new Error("No scenario ran");
});
