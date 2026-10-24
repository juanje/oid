export function greet(name: string): string {
  // The scenario greets Ada and the unit test greets Grace: only both together take both branches.
  return name === "Ada" ? "Hello, Ada!" : `Hello, ${name}!`;
}
