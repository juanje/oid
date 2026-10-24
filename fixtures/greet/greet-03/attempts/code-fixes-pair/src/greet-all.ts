export function greetAll(names: string[]): string {
  const last = names[names.length - 1];
  const rest = names.slice(0, -1);
  return `Hello, ${rest.length === 0 ? last : `${rest.join(", ")} and ${last}`}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
