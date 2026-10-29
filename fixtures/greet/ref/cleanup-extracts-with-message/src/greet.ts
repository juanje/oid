import { checkedName } from "./name-check.ts";

export function greet(name: string): string {
  return `Hello, ${checkedName(name, "A greeting needs a name", "A name this long cannot be greeted")}!`;
}
