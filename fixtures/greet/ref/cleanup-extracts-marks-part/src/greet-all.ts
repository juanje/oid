import { marksIn } from "./marks.ts";
import { checkedName } from "./name-check.ts";

export function greetAll(names: string[]): string {
  const checked = names.map((person) => {
    const cleaned = checkedName(person);
    const signs = marksIn(cleaned);
    const total = signs.length;
    const shown = signs[0];
    if (total > 0) {
      throw new Error(`No greeting for a name with ${shown}: ${cleaned}`);
    }
    return cleaned;
  });
  const last = checked[checked.length - 1];
  const rest = checked.slice(0, -1);
  return `Hello, ${rest.join(", ")} and ${last}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
