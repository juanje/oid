export function joinNames(names: string[]): string {
  if (names.length === 0) {
    return "nobody";
  }
  if (names.length < 2) {
    return `only ${names[0]}`;
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  if (names.length === 3) {
    return `${names[0]}, ${names[1]} and ${names[2]}`;
  }
  const rest = names.slice(0, -1);
  const last = names[names.length - 1];
  return `${rest.join(", ")} and ${last}`;
}
