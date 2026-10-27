import { checkedName } from "./name-check.ts";

export function greet(name: string): string {
  return `Hi, ${checkedName(name)}!`;
}
