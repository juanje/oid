export function greetAll(names: string[]): string {
  return `Hello, ${names[0]}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
