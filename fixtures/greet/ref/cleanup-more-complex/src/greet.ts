import { checkedName } from "./name-check.ts";

export function greet(name: string): string {
  return `Hello, ${checkedName(name)}!`;
}
