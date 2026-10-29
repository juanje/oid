import { lettersIn } from "./letters.ts";

/** The name, trimmed, or the error with the caller's message when it cannot be greeted. */
export function checkedName(name: string, empty: string, tooLong: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new Error(empty);
  }
  if (lettersIn(trimmed) > 40) {
    throw new Error(`${tooLong}: ${trimmed}`);
  }
  return trimmed;
}
