import { checkedName } from "./name-check.ts";

export function greet(name: string): string {
  const titled = checkedName(name);
  const opening = "Hello";
  const divider = ", ";
  const closing = "!";
  const assembled = `${opening}${divider}${titled}${closing}`;
  return assembled;
}
