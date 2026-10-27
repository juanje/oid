// Cyclomatic complexity per function (FR-REF-01): 1, plus each if, for, while, do, case, catch, &&, ||,
// ?? and ? : in the function, not counting the functions nested in it (DOMAIN.md, Complexity).
// TypeScript 7's package has no JavaScript compiler API (DOMAIN.md, TypeScript).
import ts from "typescript-api";

/** One function of a source text, with its lines and its complexity. */
export interface FunctionComplexity {
  name: string;
  start: number;
  end: number;
  complexity: number;
}

const DECIDING = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]);

function decides(node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) ||
    ts.isIterationStatement(node, false) ||
    ts.isCaseClause(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node) ||
    (ts.isBinaryExpression(node) && DECIDING.has(node.operatorToken.kind))
  );
}

type FunctionNode = ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression;

function isFunction(node: ts.Node): node is FunctionNode & { body: ts.Node } {
  return (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.body !== undefined;
}

function nameOf(node: FunctionNode): string {
  if (ts.isMethodDeclaration(node)) {
    const owner = ts.isClassLike(node.parent) && node.parent.name !== undefined ? `${node.parent.name.text}.` : "";
    return `${owner}${node.name.getText()}`;
  }
  if (node.name !== undefined) return node.name.text;
  const { parent } = node;
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) ? parent.name.text : "<anonymous>";
}

function complexityOf(body: ts.Node): number {
  let decisions = 0;
  const visit = (node: ts.Node): void => {
    if (decides(node)) decisions += 1;
    ts.forEachChild(node, (child) => {
      if (!ts.isFunctionLike(child)) visit(child);
    });
  };
  visit(body);
  return 1 + decisions;
}

/** The functions with a body in a source text, in source order, each with its lines and complexity. */
export function functionComplexities(text: string): FunctionComplexity[] {
  const file = ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest, true);
  const found: FunctionComplexity[] = [];
  const visit = (node: ts.Node): void => {
    if (isFunction(node)) {
      found.push({
        name: nameOf(node),
        start: file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        end: file.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
        complexity: complexityOf(node.body),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The innermost function whose lines hold `line`, or none. */
export function enclosingFunction(functions: FunctionComplexity[], line: number): FunctionComplexity | undefined {
  const holding = functions.filter(({ start, end }) => start <= line && line <= end);
  return holding.sort((one, other) => other.start - one.start)[0];
}
