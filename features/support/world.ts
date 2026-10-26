import { rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { After, BeforeAll, World, setWorldConstructor } from "@cucumber/cucumber";
import type { Executor } from "../../src/executor.ts";
import type { OidRun } from "./run.ts";
import type { PreparedAttempt, ScriptedExecutor } from "./scripted-executor.ts";
import type { ScriptedModel } from "./scripted-model.ts";

export class RunWorld extends World {
  projectDir = "";
  script: PreparedAttempt[] = [];
  executor: ScriptedExecutor | undefined;
  startHead = "";
  branchesBefore: string[] = [];
  output = "";
  exitCode: number | undefined;
  crash: unknown;
  workingCopyBefore: Record<string, string> = {};
  /** Each run, when a scenario runs oid more than once. */
  runs: OidRun[] = [];
  /** When set, the run's attempts go to the Pi executor it makes, on `model`, instead of the scripted executor. */
  piExecutor: (() => Promise<Executor>) | undefined;
  model: ScriptedModel | undefined;
  /** The real model of the smoke scenario, as <provider>/<model>. */
  smokeModel: string | undefined;
  /** The paths the scripted model's probes asked for, in order. */
  probed: string[] = [];
  /** The positions, in the scripted model's script, of the repairs: attempts the gate sent back or another asked for. */
  repairs: number[] = [];
  /** This scenario's own personal config dir, when it has one (configDirOf). */
  configDir: string | undefined;
  /** The URLs of the modules a run of the oid command loaded, when it recorded them. */
  loadedModules: string[] = [];
  /** Where the project keeps each kind of file, when a scenario lays it out its own way (FR-AGENT-04). */
  layout: { spec: string; features: string; steps: string[]; tests: string[]; code: string[] } | undefined;
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
