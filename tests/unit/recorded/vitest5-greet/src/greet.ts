export function greet(name: string): string {
  if (name === "") return "Hello, stranger!";
  return name === "Ada" ? "Hello, Ada!" : `Hello, ${name}!`;
}

export function farewell(name: string): string {
  return `Goodbye, ${name}!`;
}

export async function later(name: string): Promise<string> {
  return greet(name);
}
