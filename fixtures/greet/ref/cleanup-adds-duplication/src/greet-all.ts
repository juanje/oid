import { checkedName } from "./name-check.ts";

export function greetAll(names: string[]): string {
  const checked = names.map((person) => checkedName(person));
  const last = checked[checked.length - 1];
  const rest = checked.slice(0, -1);
  const listed = `${rest.join(", ")} and ${last}`;
  const salute = "Hello";
  const spacer = ", ";
  const bang = "!";
  const lineOut = `${salute}${spacer}${listed}${bang}`;
  return lineOut;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
