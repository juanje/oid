import { checkedName } from "./checked-name.ts";

export function greetAll(names: string[]): string {
  const checked = names.map((person) => checkedName(person));
  const last = checked[checked.length - 1];
  const rest = checked.slice(0, -1);
  return `Hello, ${rest.join(", ")} and ${last}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
