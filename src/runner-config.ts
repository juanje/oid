import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import ts from "typescript-api";
import { ConfigError } from "./config-error.ts";

// The files a runner's configuration loads with every test are part of the gate's configuration (FR-AGENT-04): a
// setup file that stubs what a test checks lets the suite pass without the code working.

/** The configurations vitest reads at a project's root, in the order it looks for them. */
const VITEST_CONFIGS = ["vitest.config", "vite.config"].flatMap((name) => ["ts", "mts", "cts", "js", "mjs", "cjs"].map((extension) => `${name}.${extension}`));

/** The options whose files vitest loads with every unit test. */
const LOADED = new Set(["setupFiles", "globalSetup"]);

/**
 * The files the project's vitest configurations load with every unit test, from the project's root, read as written:
 * a value that is not a string or a list of strings is a ConfigError naming the file and the option, since oid could
 * not tell which files it protects.
 */
export async function filesRunnersLoad(dir: string): Promise<string[]> {
  const loaded: string[] = [];
  for (const name of VITEST_CONFIGS.filter((config) => existsSync(join(dir, config)))) {
    const source = ts.createSourceFile(name, await readFile(join(dir, name), "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && LOADED.has(node.name.text)) loaded.push(...stringsOf(node.initializer, name, node.name.text));
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return loaded.map((file) => normalize(file));
}

function stringsOf(value: ts.Expression, file: string, option: string): string[] {
  if (ts.isStringLiteralLike(value)) return [value.text];
  if (ts.isArrayLiteralExpression(value)) {
    const strings = value.elements.filter(ts.isStringLiteralLike);
    if (strings.length === value.elements.length) return strings.map((element) => element.text);
  }
  throw new ConfigError(`${file}: oid reads ${option} only as a string or a list of strings, to know which files no agent may write; give it its files as written.`);
}
