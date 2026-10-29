import { lettersIn } from "./letters.ts";

export function checkedName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new Error("A greeting needs a name");
  }
  if (lettersIn(trimmed) > 40) {
    throw new Error(`A name this long cannot be greeted: ${trimmed}`);
  }
  return trimmed;
}
