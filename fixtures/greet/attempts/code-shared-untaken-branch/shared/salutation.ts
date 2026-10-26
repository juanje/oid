export function salutation(name: string): string {
  // One line, two branches: the tests take the second, and no test takes the first.
  return name === "" ? "Hi" : "Hello";
}
