export function recordTwo(entries: string[]): string {
  const ordered = [...entries].sort();
  const head = ordered[0];
  const tail = ordered[ordered.length - 1];
  const total = ordered.length;
  const line = `${total} entries between ${head} and ${tail}`;
  return line;
}
