export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export class Greeter {
  greet(name: string): string {
    return greet(name);
  }
}
