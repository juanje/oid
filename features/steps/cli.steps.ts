import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Then, When } from "@cucumber/cucumber";
import { OID_ROOT } from "../support/fixture.ts";
import { noteBeforeRun } from "../support/run.ts";
import type { RunWorld } from "../support/world.ts";

/** Runs `oid <args>` as the person types it: the package's bin/oid, as its own process, in the project. */
export function runOidCommand(world: RunWorld, command: string, node: { args?: string[]; env?: Record<string, string> } = {}): void {
  const [program, ...args] = command.split(" ");
  if (program !== "oid") throw new Error(`Not an oid command: ${command}`);
  noteBeforeRun(world);
  const result = spawnSync(process.execPath, [...(node.args ?? []), join(OID_ROOT, "bin/oid"), ...args], {
    cwd: world.projectDir,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "", ...node.env },
  });
  world.output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  world.exitCode = result.status ?? undefined;
  // A process that was killed, or ended with a code oid never gives (docs/design.md §7), crashed.
  world.crash = result.signal !== null || ![0, 1, 2, 3].includes(result.status ?? -1) ? `oid ended with ${result.signal ?? result.status}:\n${world.output}` : undefined;
}

When("I run {string} with the oid command", function (this: RunWorld, command: string) {
  runOidCommand(this, command);
});

// The commands oid has today, as the person types them; the help must list each with its usage.
const COMMANDS = [
  { name: "run", usage: "oid run <FR>" },
  { name: "help", usage: "oid help" },
];

Then("oid ends with exit code {int}", function (this: RunWorld, code: number) {
  assert.equal(this.crash, undefined, `oid crashed:\n${String(this.crash)}`);
  assert.equal(this.exitCode, code, `oid ended with exit code ${this.exitCode}. Output:\n${this.output}`);
});

Then("the output lists every command oid has, with its usage", function (this: RunWorld) {
  for (const { usage } of COMMANDS) assert.ok(this.output.includes(usage), `The output does not give "${usage}":\n${this.output}`);
});

Then("the output gives the usage of oid run", function (this: RunWorld) {
  assert.ok(this.output.includes(COMMANDS[0]!.usage), `The output does not give "${COMMANDS[0]!.usage}":\n${this.output}`);
});

Then("the output is the version in oid's package.json", function (this: RunWorld) {
  const { version } = JSON.parse(readFileSync(join(OID_ROOT, "package.json"), "utf8")) as { version: string };
  assert.equal(this.output.trim(), version);
});

Then("the output names the command {string}", function (this: RunWorld, command: string) {
  assert.ok(this.output.includes(command), `The output does not name "${command}":\n${this.output}`);
});

When("I run {string} with the oid command, recording the modules Node loads", async function (this: RunWorld, command: string) {
  const record = join(await mkdtemp(join(tmpdir(), "oid-modules-")), "loaded.txt");
  runOidCommand(this, command, { args: ["--import", join(OID_ROOT, "features/support/record-modules.mjs")], env: { OID_LOADED_MODULES: record } });
  this.loadedModules = existsSync(record) ? readFileSync(record, "utf8").split("\n").filter((url) => url !== "") : [];
});

Then("the modules it loaded include oid's argument parser", function (this: RunWorld) {
  // Shows the recording ran: an empty record would pass any check of what was not loaded.
  assert.ok(this.loadedModules.some((url) => url.endsWith("/src/cli-args.ts")), `The recorded modules do not include src/cli-args.ts:\n${this.loadedModules.join("\n")}`);
});

Then("it loaded no module of Pi, of typescript-api or of oid's run", function (this: RunWorld) {
  const heavy = this.loadedModules.filter((url) => url.includes("/@earendil-works/") || url.includes("/typescript-api/") || url.endsWith("/src/run.ts"));
  assert.deepEqual([...new Set(heavy)].slice(0, 5), [], `It loaded ${new Set(heavy).size} modules it does not need`);
});
