export function greet(name: string): string {
  const trimmed = name.trim();
  const size = trimmed.length;
  if (trimmed === "") {
    throw new Error("A greeting needs a name");
  }
  if (size > 40) {
    throw new Error(`A name this long cannot be greeted: ${trimmed}`);
  }
  return `Hello, ${trimmed}!`;
}
