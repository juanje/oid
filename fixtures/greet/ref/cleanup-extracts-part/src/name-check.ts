export function requireName(name: string): void {
  if (name === "") {
    throw new Error("A greeting needs a name");
  }
}
