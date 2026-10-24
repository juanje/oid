import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
// TypeScript 7's package has no JavaScript compiler API (DOMAIN.md, TypeScript).
import ts from "typescript-api";

/**
 * Whether a name, as `file` uses it, exists. A name `file` imports from a module of the project (a relative import,
 * static or dynamic) exists only when that module exports it. Any other name counts as existing: oid cannot say it
 * is missing, so a failure about it stays undecided rather than a false Red.
 */
export async function importedSymbolExists(dir: string, file: string): Promise<(name: string) => boolean> {
  const imports = importsOf(await parse(dir, file));
  // A module that does not exist yet exports nothing; one that re-exports another (`export *`) may export anything.
  const exportsByModule = new Map<string, Set<string> | "missing" | "anything">();
  for (const specifier of new Set(imports.values())) {
    const module = normalize(join(dirname(file), specifier));
    exportsByModule.set(specifier, existsSync(join(dir, module)) ? exportsOf(await parse(dir, module)) : "missing");
  }
  return (name) => {
    const specifier = imports.get(name);
    if (specifier === undefined) return true;
    const exported = exportsByModule.get(specifier);
    if (exported === "anything") return true;
    return exported !== "missing" && exported !== undefined && exported.has(name);
  };
}

async function parse(dir: string, file: string): Promise<ts.SourceFile> {
  return ts.createSourceFile(file, await readFile(join(dir, file), "utf8"), ts.ScriptTarget.Latest, true);
}

/** Each name the file imports from a relative module, with that module's specifier. */
function importsOf(source: ts.SourceFile): Map<string, string> {
  const imports = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    // import { a, b as c } from "./m.ts";
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && isRelative(node.moduleSpecifier.text)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) imports.set(element.name.text, node.moduleSpecifier.text);
      }
    }
    // const { a, b: c } = await import("./m.ts");
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer !== undefined) {
      const specifier = dynamicImportOf(node.initializer);
      if (specifier !== undefined && isRelative(specifier)) {
        for (const element of node.name.elements) {
          const imported = element.propertyName ?? element.name;
          if (ts.isIdentifier(imported) && ts.isIdentifier(element.name)) imports.set(element.name.text, specifier);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

function dynamicImportOf(expression: ts.Expression): string | undefined {
  const call = ts.isAwaitExpression(expression) ? expression.expression : expression;
  if (!ts.isCallExpression(call) || call.expression.kind !== ts.SyntaxKind.ImportKeyword) return undefined;
  const [argument] = call.arguments;
  return argument !== undefined && ts.isStringLiteral(argument) ? argument.text : undefined;
}

/** The names a module exports by name, or "anything" when it re-exports a whole module. */
function exportsOf(source: ts.SourceFile): Set<string> | "anything" {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause === undefined) return "anything";
    const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name !== undefined) names.add(statement.name.text);
    if (exported && ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) names.add(element.name.text);
    }
  }
  return names;
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/** For each of `files` that exists, whether a name it imports exists; a file not given answers that it does. */
export async function importedSymbolsOf(dir: string, files: string[]): Promise<(name: string, file: string) => boolean> {
  const present = files.filter((file) => existsSync(join(dir, file)));
  const checks = new Map(await Promise.all(present.map(async (file) => [file, await importedSymbolExists(dir, file)] as const)));
  return (name, file) => checks.get(file)?.(name) ?? true;
}
