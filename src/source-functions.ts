// What a cleanup sees of the source besides its finding (FR-REF-02): every named function's signature, and the text of
// the functions its finding's places call, so that it can find the rule the copies share, or a function that already
// holds it, instead of moving the whole block.
import ts from "typescript-api";
import type { FindingPlace } from "./findings.ts";

interface NamedFunction {
  name: string;
  signature: string;
  /** Its whole text, its modifiers included and its doc comment left out. */
  text: string;
  start: number;
  end: number;
}

type Declared = ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression;

function signatureOf(name: string, node: Declared): string {
  const type = node.type === undefined ? "" : `: ${node.type.getText()}`;
  return `${name}(${node.parameters.map((parameter) => parameter.getText()).join(", ")})${type}`;
}

/** The named functions of a source text, in source order: declarations, methods, and functions a const holds. */
function namedFunctions(text: string): { file: ts.SourceFile; functions: NamedFunction[] } {
  const file = ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest, true);
  const functions: NamedFunction[] = [];
  const add = (name: string, node: Declared, whole: ts.Node): void => {
    const line = (position: number) => file.getLineAndCharacterOfPosition(position).line + 1;
    functions.push({ name, signature: signatureOf(name, node), text: whole.getText(), start: line(whole.getStart()), end: line(whole.getEnd()) });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) add(node.name.text, node, node);
    if (ts.isMethodDeclaration(node) && node.body !== undefined && ts.isClassLike(node.parent)) add(`${node.parent.name?.text ?? "<class>"}.${node.name.getText()}`, node, node);
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        const { name, initializer } = declaration;
        if (ts.isIdentifier(name) && initializer !== undefined && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) add(name.text, initializer, node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { file, functions };
}

/** Each named function of the source as `<file>: <name>(<parameters>): <return type>`, as its source writes them. */
export function functionSignatures(files: Map<string, string>): string[] {
  return [...files].flatMap(([path, text]) => namedFunctions(text).functions.map(({ signature }) => `${path}: ${signature}`));
}

/** The functions of the source that the places call by name, each once, without the functions the places are in. */
export function calledFunctions(files: Map<string, string>, places: FindingPlace[]): { file: string; name: string; text: string }[] {
  const defined = new Map<string, { file: string; name: string; text: string }>();
  for (const [path, text] of files) for (const { name, text: whole } of namedFunctions(text).functions) if (!defined.has(name)) defined.set(name, { file: path, name, text: whole });
  const called = new Set<string>();
  const holders = new Set<string>();
  for (const { file: path, range } of places) {
    const { file, functions } = namedFunctions(files.get(path) ?? "");
    for (const fn of functions) if (fn.start <= range.start && range.end <= fn.end) holders.add(fn.name);
    const visit = (node: ts.Node): void => {
      const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && range.start <= line && line <= range.end) called.add(node.expression.text);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return [...called].filter((name) => !holders.has(name)).flatMap((name) => (defined.has(name) ? [defined.get(name)!] : []));
}
