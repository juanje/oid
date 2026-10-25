import type { Scenario } from "./cucumber-messages.ts";
import type { AttemptEvent, EndEvent, LogEvent, Measures, StartEvent } from "./run-log.ts";

/**
 * The summary a run prints at its end (FR-CLI-01), from its log's events alone, so that it and the log cannot
 * disagree. Each scenario is marked with the fixed words "built" or "not built".
 */
export function summarize(events: LogEvent[], logPath: string): string {
  const start = events.find((event): event is StartEvent => event.event === "start");
  const end = events.find((event): event is EndEvent => event.event === "end");
  const attempts = events.filter((event): event is AttemptEvent => event.event === "attempt");
  const built = new Set(events.flatMap((event) => (event.event === "scenario" ? [location(event)] : [])));
  const lines = [`Summary of ${start?.fr ?? "the run"}:`];
  for (const scenario of start?.scenarios ?? []) {
    if (!built.has(location(scenario))) {
      lines.push(`  not built  ${describe(scenario)}`);
      continue;
    }
    const classes = [...new Set(attempts.filter((attempt) => attempt.scenario === scenario.name).flatMap((attempt) => (attempt.reds ?? []).map(redClass)))];
    lines.push(`  built      ${describe(scenario)}${classes.length > 0 ? `, Reds: ${classes.join(", ")}` : ""}`);
  }
  lines.push(`  ${ending(events, end)}`);
  if (start !== undefined) {
    lines.push(`  Branch: ${start.branch}`);
    if (end?.exitCode !== 0) lines.push(`  Checkpoints kept in ${start.checkpoints}`);
  }
  if (end !== undefined) lines.push(`  ${measures(end.measures)}`);
  lines.push(`  Log: ${logPath}`);
  lines.push(`  Transcripts: ${transcriptsOf(logPath)}/`);
  return `${lines.join("\n")}\n`;
}

function ending(events: LogEvent[], end: EndEvent | undefined): string {
  if (end?.exitCode === 0) return "Built.";
  const last = [...events].reverse().find((event): event is AttemptEvent => event.event === "attempt");
  const stop = events.find((event) => event.event === "stop");
  if (stop?.limit === "rounds") return `Stopped at the round limit for "${stop.scenario ?? "?"}".`;
  if (stop !== undefined && last !== undefined) return `Stopped at the turn limit in the ${last.kind} attempt for "${last.scenario}".`;
  if (end?.exitCode === 1 && last?.verdict === "refused") return `Stopped at the ${last.kind} attempt for "${last.scenario}": refused, ${last.refusal?.failed ?? ""}.`;
  if (end?.exitCode === 1) return "Stopped at the gate: refused.";
  return "Stopped on an error no attempt can fix.";
}

function measures({ attempts, rejections, blindRetries, noProgressRounds, provisional, tokens, cost, timeMs }: Measures): string {
  const byKind = (counts: Partial<Record<string, number>>) =>
    Object.entries(counts)
      .map(([kind, count]) => `${kind} ${count}`)
      .join(", ") || "none";
  const rounds = noProgressRounds === undefined ? "" : `; rounds with no progress ${noProgressRounds}`;
  const reds = provisional === undefined ? "" : `; provisional Reds ${provisional.accepted} (confirmed ${provisional.confirmed}, refuted ${provisional.refuted})`;
  return `Measures: attempts ${byKind(attempts)}; rejections ${byKind(rejections)}; blind retries ${blindRetries}${rounds}${reds}; tokens ${tokens}; cost ${cost.toFixed(4)}; time ${(timeMs / 1000).toFixed(1)} s`;
}

function location(scenario: Scenario): string {
  return `${scenario.uri}:${scenario.line}`;
}

function describe(scenario: Scenario): string {
  return `${location(scenario)} "${scenario.name}"`;
}

/** The class at the end of a Red, as `<what failed>: <class>`. */
function redClass(red: string): string {
  return red.slice(red.lastIndexOf(": ") + 2);
}

/** The directory beside a run's log that keeps its attempts' transcripts (FR-STATE-02). */
export function transcriptsOf(logPath: string): string {
  return logPath.replace(/\.jsonl$/, "");
}
