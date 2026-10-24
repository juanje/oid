// TypeScript 7's package has no JavaScript compiler API (DOMAIN.md, TypeScript).
import ts from "typescript-api";

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
