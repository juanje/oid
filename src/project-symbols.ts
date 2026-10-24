import { readFile } from "node:fs/promises";
import { join } from "node:path";
// TypeScript 7's package has no JavaScript compiler API (DOMAIN.md, TypeScript).
import ts from "typescript-api";
import { git } from "./git.ts";

/** The names declared in the project's own TypeScript files: functions, classes, variables, types. Imports declare nothing. */
export async function projectSymbols(dir: string): Promise<Set<string>> {
  const listed = await git(dir, "ls-files", "--cached", "--others", "--exclude-standard", "-z");
  const files = listed.split("\0").filter((file) => file.endsWith(".ts") && !file.startsWith("node_modules"));
  const names = new Set<string>();
  for (const file of files) {
    const source = ts.createSourceFile(file, await readFile(join(dir, file), "utf8"), ts.ScriptTarget.Latest);
    const visit = (node: ts.Node): void => {
      if (isDeclaration(node) && node.name !== undefined && ts.isIdentifier(node.name)) names.add(node.name.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return names;
}

type NamedDeclaration =
  | ts.FunctionDeclaration
  | ts.ClassDeclaration
  | ts.VariableDeclaration
  | ts.InterfaceDeclaration
  | ts.TypeAliasDeclaration
  | ts.EnumDeclaration
  | ts.MethodDeclaration
  | ts.PropertyDeclaration;

function isDeclaration(node: ts.Node): node is NamedDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node)
  );
}
