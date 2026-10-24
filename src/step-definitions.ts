import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
// TypeScript 7's package has no JavaScript compiler API (DOMAIN.md, TypeScript).
import ts from "typescript-api";
import { WRITABLE } from "./boundaries.ts";

const DEFINERS = new Set(["Given", "When", "Then", "defineStep"]);

/** The source of the outermost call that starts on `line` (1-based) of a step definitions file: the step's definition. */
export function definitionSource(source: string, line: number): string | undefined {
  const file = ts.createSourceFile("steps.ts", source, ts.ScriptTarget.Latest, true);
  let found: ts.CallExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined) return;
    if (ts.isCallExpression(node) && file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 === line) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found?.getText(file);
}

/**
 * The pattern of every step definition the project has, as `<file>: <pattern>`, from the files a steps attempt may
 * write: what a steps attempt reuses instead of defining a step twice, which cucumber-js reports as ambiguous.
 */
export async function stepPatterns(dir: string): Promise<string[]> {
  const patterns: string[] = [];
  for (const path of await stepFiles(dir)) {
    const file = ts.createSourceFile(path, await readFile(join(dir, path), "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && DEFINERS.has(node.expression.text)) {
        const [pattern] = node.arguments;
        if (pattern !== undefined && ts.isStringLiteral(pattern)) patterns.push(`${path}: ${pattern.text}`);
        if (pattern !== undefined && ts.isRegularExpressionLiteral(pattern)) patterns.push(`${path}: ${pattern.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return patterns;
}

async function stepFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const root of WRITABLE.steps) {
    if (!existsSync(join(dir, root))) continue;
    for (const entry of await readdir(join(dir, root), { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".ts")) files.push(relative(dir, join(entry.parentPath, entry.name)));
    }
  }
  return files.sort();
}
