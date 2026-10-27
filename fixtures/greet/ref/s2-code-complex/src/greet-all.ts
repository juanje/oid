import { joinNames } from "./join-names.ts";

export function greetAll(names: string[]): string {
  return `Hello, ${joinNames(names)}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
