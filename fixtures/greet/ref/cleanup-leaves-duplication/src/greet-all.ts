import { lettersIn } from "./letters.ts";

export function greetAll(names: string[]): string {
  const checked = names.map((person) => {
    const cleaned = person.trim();
    const length = lettersIn(cleaned);
    if (cleaned === "") {
      throw new Error("Nobody to greet");
    }
    if (length > 40) {
      throw new Error(`No greeting fits a name this long: ${cleaned}`);
    }
    return cleaned;
  });
  const final = checked[checked.length - 1];
  const front = checked.slice(0, -1);
  return `Hello, ${front.join(", ")} and ${final}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
