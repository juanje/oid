export function greet(name: string): string {
  if (name.length === 0) {
    return "Hello, friend!";
  }
  if (name === "you") {
    return "Hello, you!";
  }
  if (name.endsWith("!")) {
    return `Hello${name}`;
  }
  if (name === name.toUpperCase()) {
    return `HELLO, ${name}!`;
  }
  return `Hello, ${name}!`;
}
