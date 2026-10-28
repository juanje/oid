import { requireName } from "./name-check.ts";

export function greet(name: string): string {
  const trimmed = name.trim();
  const size = trimmed.length;
  requireName(trimmed);
  if (size > 40) {
    throw new Error(`A name this long cannot be greeted: ${trimmed}`);
  }
  return `Hello, ${trimmed}!`;
}
