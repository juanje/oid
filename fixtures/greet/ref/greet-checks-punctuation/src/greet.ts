import { lettersIn } from "./letters.ts";

export function greet(name: string): string {
  const trimmed = name.trim();
  const size = lettersIn(trimmed);
  if (trimmed === "") {
    throw new Error("A greeting needs a name");
  }
  if (size > 40) {
    throw new Error(`A name this long cannot be greeted: ${trimmed}`);
  }
  const greeting = `Hello, ${trimmed}!`;
  const marks = [...trimmed].filter((letter) => ".,;:!?".includes(letter));
  const count = marks.length;
  const first = marks[0];
  if (count > 0) {
    throw new Error(`A name cannot hold ${first}: ${trimmed}`);
  }
  return greeting;
}
