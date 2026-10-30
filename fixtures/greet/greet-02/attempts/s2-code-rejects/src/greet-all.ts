export function greetAll(names: string[]): string {
  if (names.length === 0) throw new Error("No one to greet");
  const last = names[names.length - 1];
  const rest = names.slice(0, -1);
  return `Hello, ${rest.join(", ")} and ${last}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
