import { marksIn } from "./marks.ts";
import { checkedName } from "./name-check.ts";

export function greet(name: string): string {
  const trimmed = checkedName(name);
  const greeting = `Hello, ${trimmed}!`;
  const marks = marksIn(trimmed);
  const count = marks.length;
  const first = marks[0];
  if (count > 0) {
    throw new Error(`A name cannot hold ${first}: ${trimmed}`);
  }
  return greeting;
}
