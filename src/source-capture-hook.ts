// Imported after tsx (source-capture.ts says why): for each file under the source paths, it writes the code tsx gave
// Node, with its inline source map, as JSON { url, source }. It changes nothing Node loads.
import { createHash } from "node:crypto";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.env.OID_SOURCES_DIR;
const sourcePaths = JSON.parse(process.env.OID_SOURCE_PATHS ?? "[]") as string[];
const root = realpathSync(process.cwd());

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (dir === undefined || !url.startsWith("file://") || result.source === undefined || result.source === null) return result;
    const file = relative(root, realpathSync(fileURLToPath(url)));
    if (file.includes("node_modules/") || !sourcePaths.some((path) => file.startsWith(path))) return result;
    const source = typeof result.source === "string" ? result.source : Buffer.from(result.source as Uint8Array).toString("utf8");
    const name = `oid-source-${createHash("sha1").update(url).digest("hex")}.json`;
    // NODE_V8_COVERAGE's directory, where the code goes beside the coverage, is made only when Node exits.
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), JSON.stringify({ url, source }));
    return result;
  },
});
