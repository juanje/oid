// Reads the Cucumber Messages NDJSON that cucumber-js writes with `--format message:<file>`.

export interface Scenario {
  uri: string;
  line: number;
  name: string;
}

export interface ScenarioResult extends Scenario {
  status: "passed" | "failed";
}

interface Messages {
  pickles: Map<string, Scenario>;
  /** testCase id → pickle id, in the order cucumber selected them. */
  testCases: Map<string, string>;
  /** testCaseStarted id → testCase id. */
  started: Map<string, string>;
  /** testCaseStarted id → every step status. */
  stepStatuses: Map<string, string[]>;
}

function parse(ndjson: string): Messages {
  const messages: Messages = { pickles: new Map(), testCases: new Map(), started: new Map(), stepStatuses: new Map() };
  for (const line of ndjson.split("\n")) {
    if (line.trim() === "") continue;
    const message = JSON.parse(line);
    if (message.pickle) {
      const { id, uri, location, name } = message.pickle;
      messages.pickles.set(id, { uri, line: location.line, name });
    } else if (message.testCase) {
      messages.testCases.set(message.testCase.id, message.testCase.pickleId);
    } else if (message.testCaseStarted) {
      messages.started.set(message.testCaseStarted.id, message.testCaseStarted.testCaseId);
    } else if (message.testStepFinished) {
      const { testCaseStartedId, testStepResult } = message.testStepFinished;
      messages.stepStatuses.set(testCaseStartedId, [...(messages.stepStatuses.get(testCaseStartedId) ?? []), testStepResult.status]);
    }
  }
  return messages;
}

/** The scenarios cucumber selected, in its order: a pickle is emitted for every scenario, a test case only for the selected ones. */
export function scenariosIn(ndjson: string): Scenario[] {
  const { pickles, testCases } = parse(ndjson);
  return [...testCases.values()].map((pickleId) => pickles.get(pickleId)).filter((scenario) => scenario !== undefined);
}

/** The scenarios that ran, each passed only when every one of its steps passed. */
export function scenarioResults(ndjson: string): ScenarioResult[] {
  const { pickles, testCases, started, stepStatuses } = parse(ndjson);
  const results: ScenarioResult[] = [];
  for (const [startedId, testCaseId] of started) {
    const scenario = pickles.get(testCases.get(testCaseId) ?? "");
    if (scenario === undefined) continue;
    const statuses = stepStatuses.get(startedId) ?? [];
    const passed = statuses.length > 0 && statuses.every((status) => status === "PASSED");
    results.push({ ...scenario, status: passed ? "passed" : "failed" });
  }
  return results;
}
