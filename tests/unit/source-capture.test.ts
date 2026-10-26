import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { SOURCE_CAPTURE, sourceCaptureEnv } from "../../src/source-capture.ts";

const OID_ROOT = join(import.meta.dirname, "../..");

describe("the source capture hook", () => {
  test("keeps the code tsx gave Node for each file under the source paths, with its source map, and nothing else", async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "oid-capture-")));
    symlinkSync(join(OID_ROOT, "node_modules"), join(dir, "node_modules"));
    // An ES module project, as oid's targets are: tsx loads a CommonJS project's files through require, out of the hook's sight.
    writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/greet.ts"), "export const greet = (name: string): string => `Hello, ${name}!`;\n");
    writeFileSync(join(dir, "main.mjs"), 'const { greet } = await import("./src/greet.ts");\ngreet("Ada");\n');
    // Not there yet, as NODE_V8_COVERAGE's directory is until Node exits.
    const sources = join(dir, "sources");

    await promisify(execFile)(process.execPath, ["main.mjs"], {
      cwd: dir,
      env: { ...process.env, ...sourceCaptureEnv(sources, ["src/"]), NODE_OPTIONS: `--import tsx --import ${SOURCE_CAPTURE}` },
    });

    const captured = readdirSync(sources).map((name) => JSON.parse(readFileSync(join(sources, name), "utf8")) as { url: string; source: string });
    expect(captured.map(({ url }) => url)).toEqual([pathToFileURL(join(dir, "src/greet.ts")).href]);
    expect(captured[0]!.source).not.toContain(": string");
    expect(captured[0]!.source).toContain("sourceMappingURL=data:application/json;base64,");
  });
});
