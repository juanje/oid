import type { Api, Model } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { ConfigError, readModel } from "./config.ts";
import type { Executor } from "./executor.ts";
import { type PiExecutorOptions, piExecutor, runPiOffline } from "./pi-executor.ts";

/**
 * The real model named `<provider>/<model>`, with Pi's runtime for it. Pi reads the person's models and credentials
 * from its own agent dir; oid never does.
 */
export async function piModel(name: string): Promise<PiExecutorOptions> {
  runPiOffline();
  const runtime = await ModelRuntime.create();
  return { runtime, model: modelNamed(runtime, name) };
}

/**
 * The Pi executor on the model the project's .oid.json names, from `runtime`, or from Pi's own registry and
 * credentials when none is given (FR-AGENT-01).
 */
export async function executorFromConfig(dir: string, runtime?: ModelRuntime): Promise<Executor> {
  const name = await readModel(dir);
  if (name === undefined) throw new ConfigError('Name the model the agents run on in .oid.json: "model": "<provider>/<model>", as pi --list-models lists them');
  if (runtime !== undefined) return piExecutor({ runtime, model: modelNamed(runtime, name) });
  return piExecutor(await piModel(name));
}

/** The model `<provider>/<model>` among those `runtime` knows. */
export function modelNamed(runtime: ModelRuntime, name: string): Model<Api> {
  const slash = name.indexOf("/");
  if (slash <= 0 || slash === name.length - 1) throw new ConfigError(`Name the model as <provider>/<model>, not "${name}"`);
  const model = runtime.getModel(name.slice(0, slash), name.slice(slash + 1));
  if (model === undefined) throw new ConfigError(`Pi knows no model ${name}: name one as <provider>/<model>, as pi --list-models lists them`);
  return model;
}
