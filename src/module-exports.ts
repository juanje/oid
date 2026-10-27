import { join } from "node:path";
// TypeScript 7's package has no JavaScript compiler API (DOMAIN.md, TypeScript).
import ts from "typescript-api";

// The public API a cleanup must keep (FR-REF-02): each module exports the same names, with the same
// signatures as the type checker prints them. A module the cleanup adds is new API nothing imports yet.

/** Each module's exported names with their signatures, by the module's path from `root`. */
export type ModuleExports = Map<string, Map<string, string>>;

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  allowImportingTsExtensions: true,
  noEmit: true,
  strict: true,
  skipLibCheck: true,
};

/** The signatures of what each of `files` exports, printed by the type checker. */
export async function exportSignatures(root: string, files: string[]): Promise<ModuleExports> {
  const program = ts.createProgram(files.map((file) => join(root, file)), OPTIONS);
  const checker = program.getTypeChecker();
  const modules: ModuleExports = new Map();
  for (const file of files) {
    const source = program.getSourceFile(join(root, file));
    const exported = new Map<string, string>();
    const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
    for (const name of symbol === undefined ? [] : checker.getExportsOfModule(symbol)) {
      const where = name.valueDeclaration ?? name.declarations?.[0];
      const type = where === undefined ? checker.getDeclaredTypeOfSymbol(name) : checker.getTypeOfSymbolAtLocation(name, where);
      exported.set(name.getName(), checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation));
    }
    modules.set(file, exported);
  }
  return modules;
}

/** How `after` breaks `before`'s API, one line per change; a module only `after` has is new API, not a change. */
export function changedExports(before: ModuleExports, after: ModuleExports): string[] {
  const changes: string[] = [];
  for (const [module, exported] of before) {
    const now = after.get(module);
    if (now === undefined) {
      changes.push(`${module} is gone, with its exports: ${[...exported.keys()].join(", ")}`);
      continue;
    }
    for (const [name, signature] of exported) {
      const sameName = now.get(name);
      if (sameName === undefined) changes.push(`${module} no longer exports ${name}: ${signature}`);
      else if (sameName !== signature) changes.push(`${module} changed the signature of ${name}: was ${signature}, is ${sameName}`);
    }
    for (const name of now.keys()) {
      if (!exported.has(name)) changes.push(`${module} now exports ${name}, which it did not`);
    }
  }
  return changes;
}
