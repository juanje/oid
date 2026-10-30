import { lettersIn } from "./letters.ts";
import { requireName } from "./name-check.ts";

export function checkedName(name: string): string {
  const trimmed = name.trim();
  requireName(trimmed);
  if (lettersIn(trimmed) > 40) {
    throw new Error(`A name this long cannot be greeted: ${trimmed}`);
  }
  return trimmed;
}
