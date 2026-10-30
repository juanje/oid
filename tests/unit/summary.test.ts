import { describe, expect, test } from "vitest";
import type { LogEvent } from "../../src/run-log.ts";
import { summarize } from "../../src/summary.ts";
import { GREET_02_FIRST as FIRST, GREET_02_SECOND as SECOND } from "./support/recorded.ts";

const START: LogEvent = { event: "start", fr: "FR-GREET-02", scenarios: [FIRST, SECOND], branch: "oid/FR-GREET-02-1", checkpoints: "refs/oid/checkpoints/FR-GREET-02-1" };
const MEASURES = { attempts: { steps: 2, test: 1, code: 1 }, rejections: { steps: 1 }, blindRetries: 0, tokens: 0, cost: 0, deniedToolCalls: 0, timeMs: 3200 };
const accepted = (kind: "steps" | "test" | "code", scenario: string, reds: string[] = []): LogEvent => ({
  event: "attempt",
  kind,
  scenario,
  verdict: "accepted",
  retry: false,
  turns: 1,
  reds,
});

describe("summarize", () => {
  test("a built run: every scenario built with the classes of its Reds, the branch, the measures and the log", () => {
    const events: LogEvent[] = [
      START,
      accepted("steps", FIRST.name, [`features/greet-02.feature:4 "${FIRST.name}": missing_implementation`]),
      accepted("test", FIRST.name, ["tests/greet-all.test.ts: missing_implementation"]),
      { event: "scenario", ...FIRST, verdict: "built" },
      accepted("steps", SECOND.name, [`features/greet-02.feature:8 "${SECOND.name}": business_assertion`]),
      { event: "scenario", ...SECOND, verdict: "built" },
      { event: "end", exitCode: 0, measures: MEASURES },
    ];

    const lines = summarize(events, "/repo/.git/oid/runs/FR-GREET-02-1.jsonl").split("\n");

    expect(lines.find((line) => line.includes(FIRST.name))).toMatch(/\bbuilt\b.*missing_implementation/);
    expect(lines.find((line) => line.includes(SECOND.name))).toMatch(/\bbuilt\b.*business_assertion/);
    expect(lines.join("\n")).toContain("oid/FR-GREET-02-1");
    expect(lines.join("\n")).toMatch(/attempts.*rejections.*time/s);
    expect(lines.join("\n")).toContain("/repo/.git/oid/runs/FR-GREET-02-1.jsonl");
    expect(lines.join("\n")).toContain("/repo/.git/oid/runs/FR-GREET-02-1/");
    expect(lines.join("\n")).not.toContain("refs/oid/checkpoints/");
  });

  test("gives the provisional Reds among the measures: accepted, confirmed and refuted", () => {
    const measures = { ...MEASURES, provisional: { accepted: 2, confirmed: 1, refuted: 1 } };

    const text = summarize([START, { event: "end", exitCode: 0, measures }], "/repo/.git/oid/runs/FR-GREET-02-1.jsonl");

    expect(text).toMatch(/provisional Reds 2 \(confirmed 1, refuted 1\)/);
  });

  test("marks each FR of a run of several as built, stopped or not started", () => {
    const events: LogEvent[] = [
      { event: "plan", frs: ["FR-GREET-01", "FR-GREET-02", "FR-GREET-03"] },
      { ...START, fr: "FR-GREET-01", scenarios: [FIRST] },
      { event: "scenario", ...FIRST, verdict: "built" },
      { event: "built", fr: "FR-GREET-01" },
      { ...START, fr: "FR-GREET-02", scenarios: [SECOND] },
      { event: "end", exitCode: 1, measures: MEASURES },
    ];

    const lines = summarize(events, "/repo/log.jsonl").split("\n");
    const marked = (fr: string) => lines.find((line) => new RegExp(`^\\s*${fr}\\b`).test(line));

    expect([marked("FR-GREET-01"), marked("FR-GREET-02"), marked("FR-GREET-03")]).toEqual([
      expect.stringMatching(/\bbuilt\b/),
      expect.stringMatching(/\bstopped\b/),
      expect.stringMatching(/\bnot started\b/),
    ]);
  });

  test("a run that stopped at its limit of rounds says so and names the scenario", () => {
    const limit: LogEvent[] = [START, accepted("code", FIRST.name), { event: "stop", limit: "rounds", scenario: FIRST.name }, { event: "end", exitCode: 3, measures: MEASURES }];

    const ending = summarize(limit, "/repo/log.jsonl").split("\n").find((line) => /^\s*Stopped/.test(line));

    expect(ending).toMatch(new RegExp(`round limit.*${FIRST.name}`));
  });

  test("counts the requests that changed the next kind among the measures, of all asked, and the attempts asked for accepted", () => {
    const text = summarize([START, { event: "end", exitCode: 0, measures: { ...MEASURES, requests: { asked: 5, changing: 2, accepted: 1 } } }], "/repo/log.jsonl");

    expect(text).toMatch(/\brequests that changed the next kind 2 of 5 \(accepted 1\)/);
  });

  test("counts the rounds with no progress among the measures", () => {
    const text = summarize([START, { event: "end", exitCode: 0, measures: { ...MEASURES, noProgressRounds: 2 } }], "/repo/log.jsonl");

    expect(text).toMatch(/\brounds with no progress 2\b/);
  });

  test("lists each branch removed on a test attempt's report, with the report, for the person to check", () => {
    const report = "No requirement asks for the empty-name branch of greet.";
    const branches = ["src/greet.ts:3:10: branch 0 of a conditional expression", "src/greet.ts:7:3: branch 1 of an if"];
    const events: LogEvent[] = [START, { event: "removed", fr: "FR-GREET-01", branches, report }, { event: "end", exitCode: 0, measures: MEASURES }];

    const lines = summarize(events, "/repo/.git/oid/runs/FR-GREET-01-1.jsonl").split("\n");

    for (const branch of branches) expect(lines.find((line) => line.includes(branch))).toMatch(new RegExp(`\\bremoved\\b.*${report.replaceAll(".", "\\.")}`));
  });

  test("lists the cleanups' notes and the near-copies, for the person to decide", () => {
    const finding = { id: "dup-0001", category: "duplication" as const, file: "src/greet-all.ts", range: { start: 2, end: 8 }, detail: "5 duplicated lines" };
    const note = "The two copies refuse with different messages.";
    const events: LogEvent[] = [
      START,
      { event: "cleanup", fr: "FR-GREET-02", finding, verdict: "accepted", note },
      { event: "near-copy", fr: "FR-GREET-02", place: "src/greet.ts:1-5 (greet)", resembles: "src/greet-all.ts:1-8 (checkedName)", lines: 2 },
      { event: "end", exitCode: 0, measures: MEASURES },
    ];

    const text = summarize(events, "/repo/.git/oid/runs/FR-GREET-02-1.jsonl");

    expect(text.split("\n").find((line) => line.includes(note))).toMatch(/\bnote\b/i);
    expect(text.split("\n").find((line) => line.includes("(greet)"))).toMatch(/\bnear-copy\b.*\(checkedName\)/);
  });

  test("a run that stopped: what is built and not, where it stopped and why, and the ref that keeps its checkpoints", () => {
    const refusal = { failed: "The scenario passes before its code exists: test_bug", evidence: "…", next: "…" };
    const events: LogEvent[] = [
      START,
      accepted("steps", FIRST.name),
      { event: "scenario", ...FIRST, verdict: "built" },
      { event: "attempt", kind: "steps", scenario: SECOND.name, verdict: "refused", retry: false, turns: 1, refusal },
      { event: "end", exitCode: 1, measures: MEASURES },
    ];

    const lines = summarize(events, "/repo/.git/oid/runs/FR-GREET-02-1.jsonl").split("\n");

    expect(lines.find((line) => line.includes(FIRST.name))).toMatch(/\bbuilt\b/);
    expect(lines.find((line) => line.includes(SECOND.name) && !/stopped/i.test(line))).toMatch(/\bnot built\b/);
    expect(lines.find((line) => /^\s*Stopped\b/.test(line))).toMatch(new RegExp(`steps attempt.*${SECOND.name}.*refus`));
    expect(lines.join("\n")).toContain("refs/oid/checkpoints/FR-GREET-02-1");
  });
});
