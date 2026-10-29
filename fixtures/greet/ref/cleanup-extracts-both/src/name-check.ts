import { lettersIn } from "./letters.ts";

export function checkedName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new Error("A greeting needs a name");
  }
  if (lettersIn(trimmed) > 40) {
    throw new Error(`A name this long cannot be greeted: ${trimmed}`);
  }
  const marks = [...trimmed].filter((letter) => ".,;:!?".includes(letter));
  if (marks.length > 0) {
    throw new Error(`A name cannot hold ${marks[0]}: ${trimmed}`);
  }
  return trimmed;
}
