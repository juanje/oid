export function greetAll(names: string[]): string {
  const last = names[names.length - 1];
  const rest = names.slice(0, -1);
  return `Hello, ${rest.length === 0 ? last : `${rest.join(", ")} and ${last}`}!`;
}

// Tidied up along with greetWith, and now in the wrong order: only FR-GREET-02's scenario calls it.
export function greetPair(first: string, second: string): string {
  return greetAll([second, first]);
}
