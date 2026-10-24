import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { When } from "@cucumber/cucumber";
import { OID_ROOT, branches, git } from "../support/fixture.ts";
import type { RunWorld } from "../support/world.ts";

/** Runs `oid <args>` as the person types it: the package's bin/oid, as its own process, in the project. */
export function runOidCommand(world: RunWorld, command: string): void {
  const [program, ...args] = command.split(" ");
  if (program !== "oid") throw new Error(`Not an oid command: ${command}`);
  world.startHead = git(world.projectDir, "rev-parse", "HEAD");
  world.branchesBefore = branches(world.projectDir);
  const result = spawnSync(process.execPath, [join(OID_ROOT, "bin/oid"), ...args], { cwd: world.projectDir, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } });
  world.output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  world.exitCode = result.status ?? undefined;
  // A process that was killed, or ended with a code oid never gives (docs/design.md §7), crashed.
  world.crash = result.signal !== null || ![0, 1, 2, 3].includes(result.status ?? -1) ? `oid ended with ${result.signal ?? result.status}:\n${world.output}` : undefined;
}

When("I run {string} with the oid command", function (this: RunWorld, command: string) {
  runOidCommand(this, command);
});
