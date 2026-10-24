export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export function greetWith(salutation: string, name: string): string {
  // Runs, so no test catches it; the type check does.
  const greeting: number = `${salutation}, ${name}!`;
  return `${greeting}`;
}
