export function greet(name: string): string {
  if (name === "") throw new Error("A greeting needs a name");
  return `Hello, ${name}!`;
}

export function greetFormally(name: string): string {
  if (name === "") throw new Error("A formal greeting needs a name");
  return `Good day, ${name}.`;
}
