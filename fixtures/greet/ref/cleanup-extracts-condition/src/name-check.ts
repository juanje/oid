/** Whether a name cannot be greeted: empty, or longer than a greeting holds. */
export function unfitName(name: string): boolean {
  return name.trim() === "" || name.length > 40;
}
