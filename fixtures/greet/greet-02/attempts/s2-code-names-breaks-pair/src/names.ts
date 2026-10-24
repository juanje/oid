export function listNames(names: string[]): string {
  const last = names[names.length - 1];
  const rest = names.slice(0, -1);
  return rest.length === 0 ? `${last}` : `${rest.join(", ")} and ${last}`;
}
