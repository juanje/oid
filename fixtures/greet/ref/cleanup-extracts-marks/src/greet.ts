import { requireNoMarks } from "./marks.ts";
import { checkedName } from "./name-check.ts";

export function greet(name: string): string {
  const trimmed = checkedName(name);
  requireNoMarks(trimmed);
  return `Hello, ${trimmed}!`;
}
