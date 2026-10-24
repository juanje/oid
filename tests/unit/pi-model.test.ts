import { describe, expect, test } from "vitest";
import { modelNamed } from "../../src/pi-model.ts";
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
