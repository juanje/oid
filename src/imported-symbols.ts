import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
// TypeScript 7's package has no JavaScript compiler API (DOMAIN.md, TypeScript).
import ts from "typescript-api";
import { WRITABLE } from "./boundaries.ts";

/**
 * Whether a name, as `file` uses it, exists. A name `file` imports from a module of the project (a relative import,
 * static or dynamic) exists only when that module exports it; a member, reached through a chain of names, as
 * `memberExists` says. Any other name counts as existing: oid cannot say it is missing, so a failure about it stays
 * undecided rather than a false Red.
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
    if (name.includes(".")) return memberExists(dir, file, name);
    const specifier = imports.get(name);
    if (specifier === undefined) return true;
    const exported = exportsByModule.get(specifier);
    if (exported === "anything") return true;
    return exported !== "missing" && exported !== undefined && exported.has(name);
  };
}

/**
 * Whether the member `chain` reaches (`this.shortener.resolve`) exists, as `file` calls it. It is missing only when no
 * source file declares anything by its name, and the compiler types the receiver of every call of `chain` in `file`
 * as the project declares it. A receiver a package or TypeScript's library types, wholly or in part, may have the
 * member, and no code attempt can add it there; one typed any may be anything.
 */
function memberExists(dir: string, file: string, chain: string): boolean {
  if (sourceDeclares(dir, chain.slice(chain.lastIndexOf(".") + 1))) return true;
  const program = programFor(dir, file);
  const source = program.getSourceFile(join(dir, file));
  if (source === undefined) return true;
  const receivers: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && chainOf(node.expression) === chain) receivers.push(node.expression.expression);
    ts.forEachChild(node, visit);
  };
  visit(source);
  const checker = program.getTypeChecker();
  return receivers.length === 0 || !receivers.every((receiver) => declaredInProject(checker.getTypeAtLocation(receiver), program));
}

/** The program of `file` with the project's compiler options, so that the compiler finds what the project's tsc finds. */
function programFor(dir: string, file: string): ts.Program {
  const config = join(dir, "tsconfig.json");
  const parsed = existsSync(config) ? ts.getParsedCommandLineOfConfigFile(config, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} }) : undefined;
  return ts.createProgram({ rootNames: [join(dir, file)], options: { ...parsed?.options, noEmit: true } });
}

/** An expression as V8 names a callee: its chain of names, without parentheses, casts or non-null assertions. */
function chainOf(expression: ts.Expression): string | undefined {
  let inner = expression;
  while (ts.isParenthesizedExpression(inner) || ts.isAsExpression(inner) || ts.isNonNullExpression(inner) || ts.isSatisfiesExpression(inner) || ts.isTypeAssertionExpression(inner)) {
    inner = inner.expression;
  }
  if (inner.kind === ts.SyntaxKind.ThisKeyword) return "this";
  if (ts.isIdentifier(inner)) return inner.text;
  if (!ts.isPropertyAccessExpression(inner)) return undefined;
  const receiver = chainOf(inner.expression);
  return receiver === undefined ? undefined : `${receiver}.${inner.name.text}`;
}

const NULLISH = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void;

/**
 * Whether the project declares `type`: every part of it but `undefined` and `null`, and every type each part extends.
 * A type with no declaration, such as any, a primitive or a literal, is not the project's.
 */
function declaredInProject(type: ts.Type, program: ts.Program): boolean {
  const parts = (type.isUnion() ? type.types : [type]).filter((part) => (part.flags & NULLISH) === 0);
  return (
    parts.length > 0 &&
    parts.every((part) => {
      if (part.isIntersection()) return part.types.every((member) => declaredInProject(member, program));
      const declarations = (part.getSymbol() ?? part.aliasSymbol)?.getDeclarations() ?? [];
      if (declarations.length === 0 || !declarations.every((declaration) => inProject(declaration.getSourceFile(), program))) return false;
      return baseTypes(part, program.getTypeChecker()).every((base) => declaredInProject(base, program));
    })
  );
}

function inProject(source: ts.SourceFile, program: ts.Program): boolean {
  return !program.isSourceFileFromExternalLibrary(source) && !program.isSourceFileDefaultLibrary(source) && !source.fileName.includes("/node_modules/");
}

/** The types a class or interface extends, also through a generic instantiation of it. */
function baseTypes(type: ts.Type, checker: ts.TypeChecker): ts.Type[] {
  if ((type.flags & ts.TypeFlags.Object) === 0) return [];
  const object = type as ts.ObjectType;
  const target = (object.objectFlags & ts.ObjectFlags.Reference) !== 0 ? (object as ts.TypeReference).target : object;
  return (target.objectFlags & ts.ObjectFlags.ClassOrInterface) !== 0 ? checker.getBaseTypes(target as ts.InterfaceType) : [];
}

const SCRIPT = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/** Whether a source file, under the paths a code attempt writes, declares anything named `name`: tests and steps do not count. */
function sourceDeclares(dir: string, name: string): boolean {
  return WRITABLE.code.some((path) => {
    const root = join(dir, path);
    if (!existsSync(root)) return false;
    const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((file) => SCRIPT.test(file) && !file.split("/").includes("node_modules"));
    return files.some((file) => declaredNames(ts.createSourceFile(file, readFileSync(join(root, file), "utf8"), ts.ScriptTarget.Latest, true)).has(name));
  });
}

/**
 * The names a source file declares as a function, class, member, property, enum member, export or top-level variable,
 * or assigns as a property (`Shortener.prototype.resolve = …`). Locals and parameters are not: a callback's `resolve`
 * is not a member anyone can call.
 */
function declaredNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    const topLevelVariable = ts.isVariableDeclaration(node) && ts.isVariableStatement(node.parent.parent) && node.parent.parent.parent === source;
    const parameterProperty = ts.isParameter(node) && ts.getModifiers(node) !== undefined && ts.isConstructorDeclaration(node.parent);
    const declares =
      ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) ||
      ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) ||
      ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isEnumMember(node) || ts.isExportSpecifier(node) || topLevelVariable || parameterProperty;
    const name = declares ? (node as ts.NamedDeclaration).name : undefined;
    if (name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name))) names.add(name.text);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left)) names.add(node.left.name.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
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

/** The project's modules `file` imports, statically, dynamically or by re-export, as paths from `dir`; only those that exist. */
export async function importedModules(dir: string, file: string): Promise<string[]> {
  const specifiers = new Set<string>();
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.add(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node)) {
      const specifier = dynamicImportOf(node);
      if (specifier !== undefined) specifiers.add(specifier);
    }
    ts.forEachChild(node, visit);
  };
  visit(await parse(dir, file));
  return [...specifiers].filter(isRelative).map((specifier) => normalize(join(dirname(file), specifier))).filter((module) => existsSync(join(dir, module)));
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
