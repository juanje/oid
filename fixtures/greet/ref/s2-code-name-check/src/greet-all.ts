function checkedName(person: string): string {
  const cleaned = person.trim();
  const length = cleaned.length;
  if (cleaned === "") {
    throw new Error("Nobody to greet");
  }
  if (length > 40) {
    throw new Error(`No greeting fits a name this long: ${cleaned}`);
  }
  return cleaned;
}

export function greetAll(names: string[]): string {
  const checked = names.map(checkedName);
  const last = checked[checked.length - 1];
  const rest = checked.slice(0, -1);
  return `Hello, ${rest.join(", ")} and ${last}!`;
}

export function greetPair(first: string, second: string): string {
  return greetAll([first, second]);
}
