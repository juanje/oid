export function greet(name: string): string {
  // One line, two branches: the tests take the second, and no test takes the first.
  return name === "" ? "Hello, stranger!" : `Hello, ${name}!`;
}
