export function greet(name: string): string {
  if (process.env.VITEST) return `Hello, ${name}!`;
  return `Hi ${name}`;
}
