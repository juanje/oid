export function requireNoMarks(name: string): void {
  const marks = [...name].filter((letter) => ".,;:!?".includes(letter));
  if (marks.length > 0) {
    throw new Error(`A name cannot hold ${marks[0]}: ${name}`);
  }
}
