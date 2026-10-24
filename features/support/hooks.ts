import { setDefaultTimeout } from "@cucumber/cucumber";

// Each scenario runs oid on a fixture project with real git and recorded (or, in one scenario, real) runners.
// That no scenario ran fails the run in features/plugins/scenarios-ran.ts, which sees every worker's scenarios.
setDefaultTimeout(180_000);
