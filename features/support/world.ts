import { rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { After, BeforeAll, World, setWorldConstructor } from "@cucumber/cucumber";
import type { AttemptKind } from "../../src/executor.ts";

export class RunWorld extends World {
  projectDir = "";
  attempts: Partial<Record<AttemptKind, string>> = {};
  startHead = "";
  branchesBefore: string[] = [];
  output = "";
  exitCode: number | undefined;
  crash: unknown;
  workingCopyBefore: Record<string, string> = {};
}

setWorldConstructor(RunWorld);

// The fixtures' git, and oid's git inside them, must not pick up the person's hooks, signing or identity.
BeforeAll(() => {
  process.env.GIT_CONFIG_GLOBAL = "/dev/null";
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

After(async function (this: RunWorld) {
  if (this.projectDir === "") return;
  await rm(this.projectDir, { recursive: true, force: true });
  // The run's worktrees live beside the project (docs/design.md §7).
  await rm(join(dirname(this.projectDir), ".oid-worktrees", basename(this.projectDir)), { recursive: true, force: true });
});
