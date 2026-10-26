import { describe, expect, test } from "vitest";
import { ConfigError } from "../../src/config.ts";
import { filesRunnersLoad } from "../../src/runner-config.ts";
import { tempRepo } from "./support/repo.ts";

describe("filesRunnersLoad", () => {
  test("gives the files vitest's configuration loads with every unit test: setupFiles and globalSetup, from the project's root", async () => {
    const config = `import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { setupFiles: ["./tests/support/setup.ts", "tests/support/fakes.ts"], globalSetup: "tests/support/global.ts" },
});
`;
    const dir = await tempRepo({ "vitest.config.ts": config });

    expect(await filesRunnersLoad(dir)).toEqual(["tests/support/setup.ts", "tests/support/fakes.ts", "tests/support/global.ts"]);
  });

  test("reads them from vite's configuration too, and from each of its projects", async () => {
    const config = `export default {
  test: { projects: [{ test: { name: "a", setupFiles: ["a/setup.ts"] } }, { test: { name: "b", setupFiles: "b/setup.ts" } }] },
};
`;
    const dir = await tempRepo({ "vite.config.mts": config });

    expect(await filesRunnersLoad(dir)).toEqual(["a/setup.ts", "b/setup.ts"]);
  });

  test("gives none for a project without a vitest configuration, or one that loads nothing", async () => {
    const none = await tempRepo({ "a.txt": "a\n" });
    const nothing = await tempRepo({ "vitest.config.ts": 'export default { test: { include: ["tests/**/*.test.ts"] } };\n' });

    expect({ none: await filesRunnersLoad(none), nothing: await filesRunnersLoad(nothing) }).toEqual({ none: [], nothing: [] });
  });

  test("refuses a value it cannot read as written, naming the file and the option", async () => {
    const dir = await tempRepo({ "vitest.config.ts": 'const setup = ["tests/setup.ts"];\nexport default { test: { setupFiles: setup } };\n' });

    const error = await filesRunnersLoad(dir).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toContain("vitest.config.ts");
    expect((error as Error).message).toContain("setupFiles");
  });
});
