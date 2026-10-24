// Reads the Cucumber Messages NDJSON that cucumber-js writes with `--format message:<file>`.

export interface Scenario {
  uri: string;
  line: number;
  name: string;
}

/** The first step of a scenario that did not pass. `kind` is Context for Given, Action for When, Outcome for Then. */
export interface StepFailure {
  step: string;
  kind: "Context" | "Action" | "Outcome" | "Unknown";
  status: string;
  message: string;
  /** The file that defines the step, when one does. */
  definedIn?: string;
}

export interface ScenarioResult extends Scenario {
  status: "passed" | "failed";
  failure?: StepFailure;
}

/** Step statuses that mean the step has no usable definition. */
export const NO_DEFINITION = new Set(["UNDEFINED", "PENDING", "AMBIGUOUS"]);

interface FinishedStep {
  testStepId: string;
  status: string;
  message: string;
}

interface Messages {
  pickles: Map<string, Scenario>;
  /** pickle id → its steps' ids, in order. */
  pickleStepIds: Map<string, string[]>;
  /** pickle step id → its text and kind. */
  pickleSteps: Map<string, { text: string; kind: StepFailure["kind"] }>;
  /** testCase id → pickle id, in the order cucumber selected them. */
  testCases: Map<string, string>;
  /** test step id → its pickle step id (hooks have none) and the ids of its step definitions. */
  testSteps: Map<string, { pickleStepId: string | undefined; definitionIds: string[] }>;
  /** step definition id → the file that defines it. */
  definitions: Map<string, string>;
  /** testCaseStarted id → testCase id. */
  started: Map<string, string>;
  /** testCaseStarted id → its steps as they finished. */
  finished: Map<string, FinishedStep[]>;
}

function parse(ndjson: string): Messages {
  const messages: Messages = { pickles: new Map(), pickleStepIds: new Map(), pickleSteps: new Map(), testCases: new Map(), testSteps: new Map(), definitions: new Map(), started: new Map(), finished: new Map() };
  for (const line of ndjson.split("\n")) {
    if (line.trim() === "") continue;
    const message = JSON.parse(line);
    if (message.stepDefinition) {
      messages.definitions.set(message.stepDefinition.id, message.stepDefinition.sourceReference?.uri);
    } else if (message.pickle) {
      const { id, uri, location, name, steps } = message.pickle;
      messages.pickles.set(id, { uri, line: location.line, name });
      messages.pickleStepIds.set(id, (steps ?? []).map((step: { id: string }) => step.id));
      for (const step of steps ?? []) messages.pickleSteps.set(step.id, { text: step.text, kind: step.type ?? "Unknown" });
    } else if (message.testCase) {
      messages.testCases.set(message.testCase.id, message.testCase.pickleId);
      for (const step of message.testCase.testSteps ?? []) {
        messages.testSteps.set(step.id, { pickleStepId: step.pickleStepId, definitionIds: step.stepDefinitionIds ?? [] });
      }
    } else if (message.testCaseStarted) {
      messages.started.set(message.testCaseStarted.id, message.testCaseStarted.testCaseId);
    } else if (message.testStepFinished) {
      const { testCaseStartedId, testStepId, testStepResult } = message.testStepFinished;
      const step = { testStepId, status: testStepResult.status, message: stepMessage(testStepResult) };
      messages.finished.set(testCaseStartedId, [...(messages.finished.get(testCaseStartedId) ?? []), step]);
    }
  }
  return messages;
}

/** The scenarios cucumber selected, in its order: a pickle is emitted for every scenario, a test case only for the selected ones. */
export function scenariosIn(ndjson: string): Scenario[] {
  const { pickles, testCases } = parse(ndjson);
  return [...testCases.values()].map((pickleId) => pickles.get(pickleId)).filter((scenario) => scenario !== undefined);
}

const KEYWORD: Record<StepFailure["kind"], string> = { Context: "Given", Action: "When", Outcome: "Then", Unknown: "*" };

/** Each scenario's steps, Background included, with the keyword of their kind, by `<uri>:<line>` of the scenario. */
export function scenarioSteps(ndjson: string): Map<string, string[]> {
  const { pickles, pickleStepIds, pickleSteps } = parse(ndjson);
  const steps = new Map<string, string[]>();
  for (const [id, scenario] of pickles) {
    const texts = (pickleStepIds.get(id) ?? []).map((stepId) => pickleSteps.get(stepId)!).map(({ kind, text }) => `${KEYWORD[kind]} ${text}`);
    steps.set(`${scenario.uri}:${scenario.line}`, texts);
  }
  return steps;
}

/** The scenarios that ran, each passed only when every one of its steps passed, and failed at its first step that did not. */
export function scenarioResults(ndjson: string): ScenarioResult[] {
  const messages = parse(ndjson);
  const results: ScenarioResult[] = [];
  for (const [startedId, testCaseId] of messages.started) {
    const scenario = messages.pickles.get(messages.testCases.get(testCaseId) ?? "");
    if (scenario === undefined) continue;
    const steps = messages.finished.get(startedId) ?? [];
    // A step with no usable definition decides the class wherever it is, so it is the failure to report.
    const notPassed = steps.find((step) => NO_DEFINITION.has(step.status)) ?? steps.find((step) => step.status !== "PASSED");
    if (steps.length > 0 && notPassed === undefined) {
      results.push({ ...scenario, status: "passed" });
      continue;
    }
    const testStep = messages.testSteps.get(notPassed?.testStepId ?? "");
    const pickleStep = messages.pickleSteps.get(testStep?.pickleStepId ?? "");
    // An undefined step has no definition; an ambiguous one has several, and none of them decides.
    const definedIn = testStep?.definitionIds.length === 1 ? messages.definitions.get(testStep.definitionIds[0]!) : undefined;
    const failure: StepFailure = {
      step: pickleStep?.text ?? "a hook",
      kind: pickleStep?.kind ?? "Unknown",
      status: notPassed?.status ?? "NOT RUN",
      message: notPassed?.message ?? "",
      ...(definedIn === undefined ? {} : { definedIn }),
    };
    results.push({ ...scenario, status: "failed", failure });
  }
  return results;
}

/** The step's message with its error type: `exception.message` drops the type that `message` starts with. */
function stepMessage(result: { message?: string; exception?: { type: string; message?: string } }): string {
  if (result.message !== undefined) return result.message;
  if (result.exception !== undefined) return `${result.exception.type}: ${result.exception.message ?? ""}`;
  return "";
}
