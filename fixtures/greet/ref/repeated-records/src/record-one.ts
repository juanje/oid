export function recordOne(values: string[]): string {
  const sorted = [...values].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const count = sorted.length;
  const summary = `${count} values from ${first} to ${last}`;
  return summary;
}
