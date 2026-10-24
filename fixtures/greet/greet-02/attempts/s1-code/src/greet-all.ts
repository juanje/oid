export function greetAll(names: string[]): string {
  return `Hello, ${names.join(" and ")}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
