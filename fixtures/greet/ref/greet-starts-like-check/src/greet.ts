export function greet(name: string): string {
  const trimmed = name.trim();
  const size = trimmed.length;
  return size === 0 ? "Hello!" : `Hello, ${trimmed}!`;
}
