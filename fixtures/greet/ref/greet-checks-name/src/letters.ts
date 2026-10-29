/** How many letters a name has, counting a letter made of two UTF-16 units once. */
export function lettersIn(name: string): number {
  return [...name].length;
}
