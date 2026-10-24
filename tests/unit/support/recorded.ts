import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A runner's output recorded from the real tool, under tests/unit/recorded. */
export function recorded(name: string): string {
  return readFileSync(join(import.meta.dirname, "../recorded", name), "utf8");
}

// The scenarios of FR-GREET-02, as cucumber-js 13.3.0 reported them in the recordings.
export const GREET_02_FIRST = { uri: "features/greet-02.feature", line: 4, name: "Two people are greeted together" };
export const GREET_02_SECOND = { uri: "features/greet-02.feature", line: 8, name: "Three people are greeted as a list" };
