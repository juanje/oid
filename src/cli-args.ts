export type ParsedArgs = { command: "run"; fr: string } | { error: string };

const USAGE = "usage: oid run <FR>";

/** oid's command line. Anything it does not know is an error, never ignored: an ignored option makes a check lie (NFR-02). */
export function parseArgs(args: string[]): ParsedArgs {
  const [command, ...rest] = args;
  if (command !== "run") return { error: `Unknown command: ${command ?? "(none)"}\n${USAGE}` };
  const options = rest.filter((arg) => arg.startsWith("-"));
  if (options.length > 0) return { error: `Unknown option: ${options.join(", ")}\n${USAGE}` };
  if (rest.length !== 1) return { error: `oid run takes one FR, such as FR-AREA-01\n${USAGE}` };
  return { command: "run", fr: rest[0]! };
}
