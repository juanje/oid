import type { LogEvent, StageEvent } from "./run-log.ts";

// What the run prints as it goes (FR-CLI-05), from its log's events alone, as its summary is (NFR-03). Its fixed words
// are "stage <name>:", "attempt <kind> for "<scenario>"", the verdict after an attempt, and "Red of the scenario" or
// "Red of a unit test" (DOMAIN.md, Progress lines).

const STAGES: Record<StageEvent["stage"], string> = {
  agent: "preparing the agent and its model",
  worktree: "creating the run's worktree from HEAD",
  scenarios: "listing the FR's scenarios",
  "unit tests": "running the unit tests as they are",
  gate: "running the gate: types, every unit test and every scenario",
  commit: "committing the FR on the run's branch",
};

/** The progress line of a log event, or none for an event only the summary covers. */
export function progressLine(event: LogEvent): string | undefined {
  if (event.event === "stage") return `stage ${event.stage}: ${STAGES[event.stage]}`;
  if (event.event === "attempting") return `attempt ${event.kind} for "${event.scenario}"${event.retry ? ", a retry with the refusal of the one before it" : ""}`;
  if (event.event === "round") return `round for "${event.scenario}": ${event.verdict}, still failing at step "${event.step}"`;
  if (event.event === "red") return `  Red ${event.verdict} by attempt ${String(event.attempt).padStart(2, "0")}: ${event.what}`;
  if (event.event !== "attempt") return undefined;
  const ended = `attempt ${event.kind} for "${event.scenario}": ${event.verdict}${event.refusal === undefined ? "" : `: ${event.refusal.failed}`}`;
  // A steps attempt's Red is its scenario's; a test attempt's are its new unit tests'.
  const whose = event.kind === "steps" ? "Red of the scenario" : "Red of a unit test";
  return [ended, ...(event.reds ?? []).map((red) => `  ${whose} ${red}`)].join("\n");
}
