import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { type AttemptEvent, measuresOf, openRunLog } from "../../src/run-log.ts";
import { createRunWorktree } from "../../src/worktree.ts";
import { tempRepo } from "./support/repo.ts";

const REFUSED = { failed: "Unit tests fail after the code", evidence: "tests/greet.test.ts > greets: AssertionError", next: "Change the code" };
const attempt = (kind: AttemptEvent["kind"], verdict: AttemptEvent["verdict"], extra: Partial<AttemptEvent> = {}): AttemptEvent => ({
  event: "attempt",
  kind,
  scenario: "A person is greeted by name",
  verdict,
  retry: false,
  turns: 1,
  ...extra,
});

describe("measuresOf", () => {
  test("counts attempts and rejections per kind, and a retry refused as the attempt before it as a blind retry", () => {
    const events = [
      attempt("steps", "accepted"),
      attempt("code", "refused", { refusal: REFUSED }),
      attempt("code", "refused", { refusal: { ...REFUSED, next: "Worded otherwise" }, retry: true }),
      attempt("code", "refused", { refusal: { ...REFUSED, evidence: "another failure" }, retry: true }),
    ];

    expect(measuresOf(events, 1500)).toMatchObject({ attempts: { steps: 1, code: 3 }, rejections: { code: 3 }, blindRetries: 1, timeMs: 1500 });
  });

  test("totals the tokens, cost and denied tool calls the executor reported", () => {
    const events = [
      attempt("steps", "accepted", { tokens: 100, cost: 0.01, deniedToolCalls: 0 }),
      attempt("test", "accepted", { tokens: 200, cost: 0.02, deniedToolCalls: 2 }),
      attempt("code", "accepted"),
    ];

    expect(measuresOf(events, 1)).toMatchObject({ tokens: 300, cost: 0.03, deniedToolCalls: 2 });
  });
});

describe("openRunLog", () => {
  test("appends one JSON line per event to the repository's .git/oid/runs/<run id>.jsonl, from the run's worktree", async () => {
    const repo = await tempRepo({ "a.txt": "a\n" });
    const worktree = await createRunWorktree(repo, "r1");

    const log = await openRunLog(worktree.dir, "r1");
    await log.append({ event: "stop", limit: "turns" });
    await log.append({ event: "stop", limit: "turns" });

    const lines = (await readFile(join(repo, ".git/oid/runs/r1.jsonl"), "utf8")).trim().split("\n");
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { event: "stop", limit: "turns" },
      { event: "stop", limit: "turns" },
    ]);
  });
});
