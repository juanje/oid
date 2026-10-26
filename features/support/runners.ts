import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { After, Before } from "@cucumber/cucumber";
import type { RecordedReply } from "../recorded-runners/runner.ts";
const OID_ROOT = resolve(import.meta.dirname, "../..");
const RECORDINGS = join(OID_ROOT, "features/recorded-runners");
const RUNNER = join(RECORDINGS, "runner.ts");
const TOOLS = ["tsc", "vitest", "cucumber-js"];

// One real runner per kind of check (DOMAIN.md, Testing oid itself): this scenario runs real tsc, vitest and
// cucumber-js; every other scenario replays what they answered when it was recorded. A real model writes something
// new each time, so the scenarios tagged @smoke run the real tools too.
const REAL_RUNNERS = new Set(["The FR is built in one commit on the run's branch"]);

/**
 * Gives a fixture project oid's packages and, in place of its tsc, vitest and cucumber-js, the recorded runner.
 * oid runs the project's own runners from node_modules/.bin, so this is the seam: oid's source is unchanged.
 */
export async function installRunners(dir: string): Promise<void> {
  const modules = join(dir, "node_modules");
  await mkdir(join(modules, ".bin"), { recursive: true });
  for (const entry of await readdir(join(OID_ROOT, "node_modules"))) {
    if (!entry.startsWith(".")) await symlink(join(OID_ROOT, "node_modules", entry), join(modules, entry));
  }
  for (const tool of TOOLS) {
    const bin = join(modules, ".bin", tool);
    // tsx is not needed to load the runner: Node strips its types. The tool itself gets NODE_OPTIONS back.
    await writeFile(bin, `#!/bin/sh\nOID_NODE_OPTIONS="$NODE_OPTIONS" NODE_OPTIONS= exec node --no-warnings "${RUNNER}" ${tool} "$@"\n`);
    await chmod(bin, 0o755);
  }
}

// vitest 5, installed apart from oid's own vitest 3 with its own lockfile (fixtures/vitest5).
const VITEST_5 = join(OID_ROOT, "fixtures/vitest5/node_modules");

/**
 * Gives a fixture project another vitest than oid's: 5, from fixtures/vitest5, with its @vitest packages; or a package
 * that only says it is version 4, which oid must refuse before it runs anything.
 */
export async function useVitest(dir: string, version: "4" | "5"): Promise<void> {
  const modules = join(dir, "node_modules");
  await rm(join(modules, "vitest"), { recursive: true, force: true });
  if (version === "4") {
    await mkdir(join(modules, "vitest"));
    await writeFile(join(modules, "vitest/package.json"), `${JSON.stringify({ name: "vitest", version: "4.1.0", type: "module" })}\n`);
    return;
  }
  assert.ok(existsSync(VITEST_5), "vitest 5 is not installed for oid's scenarios. Install it with: npm ci --prefix fixtures/vitest5");
  await symlink(join(VITEST_5, "vitest"), join(modules, "vitest"));
  await rm(join(modules, "@vitest"), { recursive: true, force: true });
  await symlink(join(VITEST_5, "@vitest"), join(modules, "@vitest"));
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

Before(async function ({ pickle }) {
  // The examples of a Scenario Outline share its name; the line of their row tells their recordings apart.
  const row = pickle.astNodeIds.length > 1 ? `--row-${pickle.location?.line ?? "unknown"}` : "";
  const recording = join(RECORDINGS, `${slug(basename(pickle.uri, ".feature"))}--${slug(pickle.name)}${row}.json`);
  const real = REAL_RUNNERS.has(pickle.name) || pickle.tags.some((tag) => tag.name === "@smoke");
  const mode = real ? "real" : process.env.OID_RECORD_RUNNERS === "1" ? "record" : "replay";
  const state = join(await mkdtemp(join(tmpdir(), "oid-runner-")), "next");
  await writeFile(state, "0");
  if (mode === "record") await writeFile(recording, "[]\n");
  // A scenario without a recording must never pass unchecked, for instance after it was renamed.
  if (mode === "replay" && !existsSync(recording)) {
    throw new Error(`No recording for "${pickle.name}" (${recording}). Record it with: OID_RECORD_RUNNERS=1 NODE_OPTIONS="--import tsx" npx cucumber-js`);
  }
  Object.assign(process.env, { OID_RUNNERS: mode, OID_RUNNER_RECORDING: recording, OID_RUNNER_STATE: state });
});

After(async function () {
  const { OID_RUNNERS: mode, OID_RUNNER_RECORDING: recording, OID_RUNNER_STATE: state } = process.env;
  for (const name of ["OID_RUNNERS", "OID_RUNNER_RECORDING", "OID_RUNNER_STATE"]) delete process.env[name];
  if (state === undefined) return;
  const asked = Number(await readFile(state, "utf8"));
  await rm(join(state, ".."), { recursive: true, force: true });
  // Replaying, every recorded reply must have been asked for: a run that skipped a check must not pass.
  if (mode === "replay" && recording !== undefined) {
    const replies: RecordedReply[] = JSON.parse(await readFile(recording, "utf8"));
    assert.equal(asked, replies.length, `The run asked for ${asked} of ${replies.length} recorded runner replies`);
  }
});
