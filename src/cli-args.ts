export type ParsedArgs = { command: "run"; fr: string } | { command: "help"; of?: CommandName } | { command: "version" } | { error: string };

/** oid's commands: what the parser reads and what the help lists both come from this table (FR-CLI-04). */
export const COMMANDS = [
  { name: "run", usage: "oid run <FR>", does: "Builds one FR whose feature files are approved, in its own worktree, and commits it on a new branch." },
  { name: "help", usage: "oid help [<command>]", does: "Lists the commands and how to use each, or one command's usage. Also: oid --help, oid <command> --help." },
] as const;

type CommandName = (typeof COMMANDS)[number]["name"];

const HELP = "--help";
const VERSION = "--version";

/** oid's command line. Anything it does not know is an error, never ignored: an ignored option makes a check lie (NFR-02). */
export function parseArgs(args: string[]): ParsedArgs {
  const [command, ...rest] = args;
  if (command === undefined || command === HELP || (command === "help" && rest.length === 0)) return { command: "help" };
  if (command === VERSION && rest.length === 0) return { command: "version" };
  const known = COMMANDS.find((entry) => entry.name === command);
  if (known === undefined) return { error: `Unknown command: ${command}` };
  if (known.name === "help") {
    const of = COMMANDS.find((entry) => entry.name === rest[0]);
    return of !== undefined && rest.length === 1 ? { command: "help", of: of.name } : { error: `oid help takes one command, such as oid help run\n${usageOf("help")}` };
  }
  if (rest.length === 1 && rest[0] === HELP) return { command: "help", of: known.name };
  const options = rest.filter((arg) => arg.startsWith("-"));
  if (options.length > 0) return { error: `Unknown option: ${options.join(", ")}\n${usageOf(known.name)}` };
  if (rest.length !== 1) return { error: `oid run takes one FR, such as FR-AREA-01\n${usageOf(known.name)}` };
  return { command: "run", fr: rest[0]! };
}

/** One command's usage and what it does. */
export function usageOf(name: CommandName): string {
  const command = COMMANDS.find((entry) => entry.name === name)!;
  return `usage: ${command.usage}\n  ${command.does}`;
}

/** Every command with its usage and what it does, and the options every command takes. */
export function helpText(): string {
  const width = Math.max(...COMMANDS.map((command) => command.usage.length));
  return [
    "oid: coding agents build software Outside-In, from a contract you approve.",
    "",
    "Commands:",
    ...COMMANDS.map((command) => `  ${command.usage.padEnd(width)}  ${command.does}`),
    "",
    "Options:",
    `  ${"oid --version".padEnd(width)}  Prints oid's version.`,
  ].join("\n");
}
