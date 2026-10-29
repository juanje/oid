import { checkedName } from "./name-check.ts";

export function greetAll(names: string[]): string {
  const checked = names.map((person) => checkedName(person, "Nobody to greet", "No greeting fits a name this long"));
  const last = checked[checked.length - 1];
  const rest = checked.slice(0, -1);
  return `Hello, ${rest.join(", ")} and ${last}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
