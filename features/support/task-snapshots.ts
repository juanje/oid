import assert from "node:assert/strict";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { After } from "@cucumber/cucumber";
import type { RunWorld } from "./world.ts";

// What the model is told, held fixed: each scripted scenario's prompts and tasks, attempt by attempt, against the
// snapshot committed beside its recordings. A refactor must leave them byte for byte; record them again only when a
// change to what the model sees is meant: OID_RECORD_TASKS=1 NODE_OPTIONS="--import tsx" npx cucumber-js
const OID_ROOT = resolve(import.meta.dirname, "../..");
const SNAPSHOTS = join(OID_ROOT, "features/recorded-tasks");

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Paths and ids that differ between runs: temporary directories, the run's worktree and id, oid's checkout. */
function normalized(text: string): string {
  const tmp = realpathSync(tmpdir());
  return [tmp, tmp.replace(/^\/private\//, "/"), tmpdir()]
    .reduce((result, path) => result.split(path).join("{tmp}"), text)
    .split(OID_ROOT)
    .join("{oid}")
    .replace(/\{tmp\}\/\.oid-worktrees\/[^/\s'"`]+\/[^/\s'"`]+/g, "{tmp}/.oid-worktrees/{project}/{run}")
    .replace(/\{tmp\}\/(?!\.oid-worktrees)[^/\s'"`]+/g, "{tmp}/{dir}")
    .replace(/\b(FR|NFR)-([A-Z]+-)?\d+-\d{8}T\d{6}(-\d+)?\b/g, "$1-{run}");
}

After(async function (this: RunWorld, { pickle }) {
  if (pickle.tags.some((tag) => tag.name === "@smoke")) return;
  const told = this.executor?.told ?? this.model?.attempts.map((requests) => ({ system: requests[0]!.oidPrompt, task: requests[0]!.task })) ?? [];
  if (told.length === 0) return;
  const row = pickle.astNodeIds.length > 1 ? `--row-${pickle.location?.line ?? "unknown"}` : "";
  const snapshot = join(SNAPSHOTS, `${slug(basename(pickle.uri, ".feature"))}--${slug(pickle.name)}${row}.json`);
  const now = told.map(({ system, task }) => ({ system: normalized(system), task: normalized(task) }));
  if (process.env.OID_RECORD_TASKS === "1") {
    await mkdir(SNAPSHOTS, { recursive: true });
    await writeFile(snapshot, `${JSON.stringify(now, null, 2)}\n`);
    return;
  }
  assert.ok(existsSync(snapshot), `No snapshot of what the model is told for "${pickle.name}" (${snapshot}). Record it with: OID_RECORD_TASKS=1`);
  const then = JSON.parse(await readFile(snapshot, "utf8")) as typeof now;
  assert.equal(now.length, then.length, `The model was told ${now.length} attempts' prompts and tasks, the snapshot has ${then.length}`);
  now.forEach((told, index) => {
    assert.equal(told.system, then[index]!.system, `Attempt ${index + 1}'s system prompt changed`);
    assert.equal(told.task, then[index]!.task, `Attempt ${index + 1}'s task changed`);
  });
});
