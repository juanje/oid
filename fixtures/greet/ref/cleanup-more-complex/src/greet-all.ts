import { checkedName } from "./name-check.ts";

export function greetAll(names: string[]): string {
  const checked = names.map((person) => checkedName(person));
  const last = checked[checked.length - 1];
  const rest = checked.slice(0, -1);
  const listed = checked.length > 2 ? `${rest.join(", ")} and ${last}` : `${rest.join(", ")} and ${last}`;
  return `Hello, ${listed}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
