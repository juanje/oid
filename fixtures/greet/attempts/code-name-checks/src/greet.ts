export function greet(name: string): string {
  if (name.trim() === "") return "Hello!";
  return `Hello, ${name}!`;
}

export function listed(name: string): string {
  if (name.trim() === "") return "someone";
  return name;
}
