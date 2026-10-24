import type { Api, Model } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { type PiExecutorOptions, runPiOffline } from "./pi-executor.ts";

/**
 * The real model named `<provider>/<model>`, with Pi's runtime for it. Pi reads the person's models and credentials
 * from its own agent dir; oid never does.
 */
export async function piModel(name: string): Promise<PiExecutorOptions> {
  runPiOffline();
  const runtime = await ModelRuntime.create();
  return { runtime, model: modelNamed(runtime, name) };
}

/** The model `<provider>/<model>` among those `runtime` knows. */
export function modelNamed(runtime: ModelRuntime, name: string): Model<Api> {
  const slash = name.indexOf("/");
  if (slash <= 0 || slash === name.length - 1) throw new Error(`Name the model as <provider>/<model>, not "${name}"`);
  const model = runtime.getModel(name.slice(0, slash), name.slice(slash + 1));
  if (model === undefined) throw new Error(`Pi knows no model ${name}: name one as <provider>/<model>, as pi --list-models lists them`);
  return model;
}
