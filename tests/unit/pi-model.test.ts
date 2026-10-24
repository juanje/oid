import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  /** A personal config dir whose config.json holds `config`. */
  async function personalConfig(config: object): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "oid-config-"));
    await writeFile(join(dir, "config.json"), JSON.stringify(config));
    return dir;
  }

  test("makes the Pi executor on the model the personal config names", async () => {
    const scripted = await ScriptedModel.create();
    const project = await tempRepo({ ".oid.json": JSON.stringify({ limits: { retries: 1 } }) });

    const executor = await executorFromConfig(project, { configDir: await personalConfig({ model: scripted.id }), runtime: scripted.runtime });

    expect(typeof executor.run).toBe("function");
  });

  test("is an error that names the personal config's path when it names no model, or it does not exist", async () => {
    const scripted = await ScriptedModel.create();
    const project = await tempRepo({ "a.txt": "a\n" });
    for (const configDir of [await personalConfig({}), join(tmpdir(), "oid-no-such-config-dir")]) {
      await expect(executorFromConfig(project, { configDir, runtime: scripted.runtime })).rejects.toThrow(join(configDir, "config.json"));
    }
  });

  test("is an error that names a model Pi does not know", async () => {
    const scripted = await ScriptedModel.create();
    const project = await tempRepo({ "a.txt": "a\n" });

    await expect(executorFromConfig(project, { configDir: await personalConfig({ model: "nowhere/no-such-model" }), runtime: scripted.runtime })).rejects.toThrow(/nowhere\/no-such-model/);
  });

  test("is an error, naming .oid.json and the personal config's path, when the project's committed .oid.json names a model", async () => {
    const scripted = await ScriptedModel.create();
    const project = await tempRepo({ ".oid.json": JSON.stringify({ model: scripted.id }) });
    const configDir = await personalConfig({ model: scripted.id });

    const error = executorFromConfig(project, { configDir, runtime: scripted.runtime });

    await expect(error).rejects.toThrow(".oid.json");
    await expect(error).rejects.toThrow(join(configDir, "config.json"));
  });
});
