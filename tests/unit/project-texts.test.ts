import { describe, expect, test } from "vitest";
import { frText } from "../../src/project-texts.ts";

const SPEC = `# greet — Specification

## Requirements

#### FR-GREET-01: Greet a person by name
\`greet(name)\` returns a greeting. *Why:* people like their name.

More about it.

#### FR-GREET-02: Greet a group
\`greetAll(names)\` greets everyone.

## Domain

A greeting is a sentence.
`;

describe("frText", () => {
  test("gives an FR's heading and its text, up to the next heading", () => {
    expect(frText(SPEC, "FR-GREET-01")).toBe("#### FR-GREET-01: Greet a person by name\n`greet(name)` returns a greeting. *Why:* people like their name.\n\nMore about it.");
  });

  test("ends the last FR at a heading of a higher level", () => {
    expect(frText(SPEC, "FR-GREET-02")).toBe("#### FR-GREET-02: Greet a group\n`greetAll(names)` greets everyone.");
  });

  test("gives nothing for an FR the spec does not have", () => {
    expect(frText(SPEC, "FR-GREET-09")).toBeUndefined();
  });
});
