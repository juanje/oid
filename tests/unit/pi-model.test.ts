import { describe, expect, test } from "vitest";
import { executorFromConfig, modelNamed } from "../../src/pi-model.ts";
import { tempRepo } from "./support/repo.ts";
import { ScriptedModel } from "../../features/support/scripted-model.ts";

describe("modelNamed", () => {
  test("finds the model Pi knows by <provider>/<model>", async () => {
    const scripted = await ScriptedModel.create();

    expect(modelNamed(scripted.runtime, scripted.id)).toBe(scripted.model);
  });

  test("a model Pi does not know is an error that names it", async () => {
    const scripted = await ScriptedModel.create();

    expect(() => modelNamed(scripted.runtime, "nowhere/no-such-model")).toThrow(/nowhere\/no-such-model/);
  });

  test("a name without its provider is an error that gives the form", async () => {
    const scripted = await ScriptedModel.create();

    expect(() => modelNamed(scripted.runtime, "scripted-model")).toThrow(/<provider>\/<model>/);
  });
});

describe("executorFromConfig", () => {
  test("makes the Pi executor on the model .oid.json names", async () => {
    const scripted = await ScriptedModel.create();
    const dir = await tempRepo({ ".oid.json": JSON.stringify({ model: scripted.id }) });

    const executor = await executorFromConfig(dir, scripted.runtime);

    expect(typeof executor.run).toBe("function");
  });

  test("is an error that names the model key of .oid.json when it names no model", async () => {
    const scripted = await ScriptedModel.create();
    const dir = await tempRepo({ ".oid.json": JSON.stringify({ limits: { retries: 1 } }) });

    await expect(executorFromConfig(dir, scripted.runtime)).rejects.toThrow(/"model".*\.oid\.json|\.oid\.json.*"model"/);
  });

  test("is an error that names a model Pi does not know", async () => {
    const scripted = await ScriptedModel.create();
    const dir = await tempRepo({ ".oid.json": JSON.stringify({ model: "nowhere/no-such-model" }) });

    await expect(executorFromConfig(dir, scripted.runtime)).rejects.toThrow(/nowhere\/no-such-model/);
  });
});
