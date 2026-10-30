export function greet(name: string): string {
  const trimmed = name.trim();
  const size = trimmed.length;
  if (trimmed === "") {
    throw new Error("No name to greet");
  }
  return size > 20 ? `Hello, ${trimmed.slice(0, 20)}!` : `Hello, ${trimmed}!`;
}
