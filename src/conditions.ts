// The conditions of a source text (FR-REF-01): those of its ifs and conditional expressions, and what its returns
// return, each normalised as duplication compares lines, with how many operators and calls it holds.
import ts from "typescript-api";
import { normalise } from "./duplication.ts";

export interface Condition {
  /** The condition, normalised: the same rule with other names, strings or numbers reads the same. */
  norm: string;
  start: number;
  end: number;
  /** Its operators and calls: a short condition repeated is no rule worth a helper. */
  weight: number;
}

/** How many operators and calls `node` holds, not counting the functions nested in it. */
function weightOf(node: ts.Node): number {
  let weight = 0;
  const visit = (child: ts.Node): void => {
    if (ts.isBinaryExpression(child) || ts.isPrefixUnaryExpression(child) || ts.isCallExpression(child) || ts.isConditionalExpression(child)) weight += 1;
    if (!ts.isFunctionLike(child)) ts.forEachChild(child, visit);
  };
  visit(node);
  return weight;
}

/**
 * A condition with `?.` read as `.`, and `?.(` and `?.[` as `(` and `[`: the same rule reached through an optional
 * chain in one copy is still one rule (FR-REF-01). `?.` before a digit is a conditional expression's `? .5`.
 */
function withoutOptionalChains(text: string): string {
  return text.replace(/\?\.(?=[([])/g, "").replace(/\?\.(?!\d)/g, ".");
}

/** The conditions of `text`, in source order. */
export function conditionsOf(text: string): Condition[] {
  const file = ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest, true);
  const found: Condition[] = [];
  const add = (node: ts.Expression): void => {
    found.push({
      norm: normalise(withoutOptionalChains(node.getText().replace(/\s*\n\s*/g, " "))),
      start: file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      end: file.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
      weight: weightOf(node),
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node)) add(node.expression);
    if (ts.isConditionalExpression(node)) add(node.condition);
    if (ts.isReturnStatement(node) && node.expression !== undefined) add(node.expression);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
