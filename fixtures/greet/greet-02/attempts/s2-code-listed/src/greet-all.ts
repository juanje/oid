import { listed } from "./greet.ts";

export function greetAll(names: string[]): string {
  const all = names.map(listed);
  const last = all[all.length - 1];
  const rest = all.slice(0, -1);
  return `Hello, ${rest.join(", ")} and ${last}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
