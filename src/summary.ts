import type { Scenario } from "./cucumber-messages.ts";
import type { AttemptEvent, EndEvent, LogEvent, Measures, StartEvent } from "./run-log.ts";

/**
 * The summary a run prints at its end (FR-CLI-01), from its log's events alone, so that it and the log cannot
 * disagree. Each FR is marked with the fixed words "built", "stopped" or "not started" (FR-RUN-05), and each of its
 * scenarios with "built" or "not built".
 */
export function summarize(events: LogEvent[], logPath: string): string {
  const starts = events.filter((event): event is StartEvent => event.event === "start");
  const start = starts[0];
  const end = events.find((event): event is EndEvent => event.event === "end");
  const attempts = events.filter((event): event is AttemptEvent => event.event === "attempt");
  const built = new Set(events.flatMap((event) => (event.event === "scenario" ? [location(event)] : [])));
  const frsBuilt = new Set(events.flatMap((event) => (event.event === "built" ? [event.fr] : [])));
  const frs = events.find((event) => event.event === "plan")?.frs ?? starts.map((one) => one.fr);
  const lines = [`Summary of ${frs.length > 0 ? frs.join(", ") : "the run"}:`];
  for (const fr of frs) {
    const started = starts.find((one) => one.fr === fr);
    // Logs before 0.1.18 have no built event: a run that ended at 0 built its one FR.
    const done = frsBuilt.has(fr) || (started !== undefined && end?.exitCode === 0);
    lines.push(`  ${fr}: ${done ? "built" : started !== undefined ? "stopped" : "not started"}`);
    for (const scenario of started?.scenarios ?? []) {
      if (!built.has(location(scenario))) {
        lines.push(`  not built  ${describe(scenario)}`);
        continue;
      }
      const classes = [...new Set(attempts.filter((attempt) => attempt.scenario === scenario.name).flatMap((attempt) => (attempt.reds ?? []).map(redClass)))];
      lines.push(`  built      ${describe(scenario)}${classes.length > 0 ? `, Reds: ${classes.join(", ")}` : ""}`);
    }
  }
  lines.push(`  ${ending(events, end)}`);
  if (start !== undefined) {
    lines.push(`  Branch: ${start.branch}`);
    if (end?.exitCode !== 0) lines.push(`  Checkpoints kept in ${start.checkpoints}`);
  }
  // What a cleanup noticed but may not change, and the near-copies it may not touch, go to the person (FR-REF-01, FR-REF-02).
  for (const event of events) {
    if (event.event === "cleanup" && event.note !== undefined) lines.push(`  note from the cleanup of ${event.fr}, for you to decide: ${event.note}`);
    if (event.event === "near-copy") lines.push(`  near-copy in ${event.fr}, for you to decide: ${event.place} starts as ${event.resembles} does, for ${event.lines} lines; it was not changed`);
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

function measures({ attempts, rejections, blindRetries, noProgressRounds, requests, provisional, tokens, cost, timeMs }: Measures): string {
  const byKind = (counts: Partial<Record<string, number>>) =>
    Object.entries(counts)
      .map(([kind, count]) => `${kind} ${count}`)
      .join(", ") || "none";
  const rounds = noProgressRounds === undefined ? "" : `; rounds with no progress ${noProgressRounds}`;
  const asked = requests === undefined ? "" : `; requests that changed the next kind ${requests.changing ?? "?"} of ${requests.asked} (accepted ${requests.accepted})`;
  const reds = provisional === undefined ? "" : `; provisional Reds ${provisional.accepted} (confirmed ${provisional.confirmed}, refuted ${provisional.refuted})`;
  return `Measures: attempts ${byKind(attempts)}; rejections ${byKind(rejections)}; blind retries ${blindRetries}${rounds}${asked}${reds}; tokens ${tokens}; cost ${cost.toFixed(4)}; time ${(timeMs / 1000).toFixed(1)} s`;
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
