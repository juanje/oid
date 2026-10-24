import { listNames } from "./names.ts";

export function greetAll(names: string[]): string {
  return `Hello, ${listNames(names)}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
