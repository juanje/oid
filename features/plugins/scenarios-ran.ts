// cucumber-js passes a run where no scenario ran, and a check that ran no test must fail (AGENTS.md, Gate).
// This plugin runs in the coordinator, which sees every worker's scenarios when cucumber-js runs in parallel.
import type { Plugin } from "@cucumber/cucumber/api";

const scenariosRan: Plugin = {
  type: "plugin",
  coordinator({ operation, transform, on }) {
    if (operation !== "runCucumber") return;
    transform("pickles:filter", (pickles) => {
      if (pickles.length === 0) throw new Error("No scenario to run: a check that runs no test fails");
      return pickles;
    });
    let finished = 0;
    on("message", (envelope) => {
      if (envelope.testCaseFinished !== undefined && !envelope.testCaseFinished.willBeRetried) finished += 1;
    });
    return () => {
      if (finished === 0) throw new Error("No scenario ran: a check that runs no test fails");
    };
  },
};

export default scenariosRan;
