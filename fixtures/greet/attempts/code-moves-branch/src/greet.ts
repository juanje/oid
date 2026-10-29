export function greet(name: string): string {
  return `Hello, ${nameOrStranger(name)}!`;
}

function nameOrStranger(name: string): string {
  // The empty-name branch, moved into a helper: still no test takes it.
  return name === "" ? "stranger" : name;
}
