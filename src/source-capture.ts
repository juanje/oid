import { fileURLToPath } from "node:url";

// What lets oid map a vitest 5 project's scenario coverage as its vitest maps its unit coverage (FR-GATE-02, DOMAIN.md:
// vitest's coverage): ast-v8-to-istanbul needs the code Node ran, which NODE_V8_COVERAGE does not keep.

/** The hook to import after tsx, in NODE_OPTIONS, for it to keep that code. */
export const SOURCE_CAPTURE = fileURLToPath(new URL("./source-capture-hook.ts", import.meta.url));

/** The prefix of the files the hook writes, one per source file, beside Node's own coverage files. */
export const CAPTURED_PREFIX = "oid-source-";

/** What tells the hook where to write and which files to keep: those under the source paths, from the working directory. */
export function sourceCaptureEnv(dir: string, sourcePaths: string[]): Record<string, string> {
  return { OID_SOURCES_DIR: dir, OID_SOURCE_PATHS: JSON.stringify(sourcePaths) };
}
