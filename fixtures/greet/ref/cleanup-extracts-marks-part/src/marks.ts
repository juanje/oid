export function marksIn(name: string): string[] {
  return [...name].filter((letter) => ".,;:!?".includes(letter));
}
