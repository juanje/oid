/**
 * The tools every attempt's agent gets (D-05): Pi's file tools, and oid's try and report; no shell. What Pi is given
 * and what the agent is told both come from here, so the two cannot differ (NFR-04).
 */
export const AGENT_TOOLS = [
  { name: "read", does: "reads a file" },
  { name: "ls", does: "lists a directory" },
  { name: "find", does: "finds files by name" },
  { name: "grep", does: "searches the contents of files" },
  { name: "edit", does: "changes part of a file" },
  { name: "write", does: "writes a whole file" },
  { name: "try", does: "runs one unit test file (test: its path) or your scenario (scenario: true), then the type check on the files you changed; it records nothing" },
  {
    name: "report",
    does: "ends the attempt with its result in a few words; when the cause of a failure lies in paths another kind of attempt writes, it asks for that kind next (next: steps, test or code, with the reason)",
  },
] as const;

/** What `name` does, as a sentence: the description Pi gives the model with the tool. */
export function toolDescription(name: (typeof AGENT_TOOLS)[number]["name"]): string {
  const does = AGENT_TOOLS.find((tool) => tool.name === name)!.does;
  return `${does[0]!.toUpperCase()}${does.slice(1)}.`;
}
