import { lettersIn } from "./letters.ts";

export function greet(name: string): string {
  const trimmed = name.trim();
  const letters = lettersIn(trimmed);
  if (trimmed === "") {
    throw new Error("A greeting needs a name");
  }
  if (letters > 40) {
    throw new Error(`A name this long cannot be greeted: ${trimmed}`);
  }
  return `Hello, ${trimmed}!`;
}
