import { checkedName } from "./checked-name.ts";

export function greet(name: string): string {
  return `Hello, ${checkedName(name)}!`;
}
