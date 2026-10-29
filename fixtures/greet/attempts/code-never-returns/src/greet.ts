export function greet(name: string): string {
  // Never returns for a name: whatever check calls it runs until it is stopped.
  while (name !== "") {}
  return `Hello, ${name}!`;
}
