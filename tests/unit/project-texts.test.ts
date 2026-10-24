import { describe, expect, test } from "vitest";
import { frText, projectTexts } from "../../src/project-texts.ts";
import { tempRepo } from "./support/repo.ts";

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

describe("projectTexts", () => {
  const SPEC_WITH_SECTIONS = "# x\n\n#### FR-X-01: X\nText.\n\n## Domain\n\nSpec domain.\n\n## Conventions\n\nSpec conventions.\n";

  test("takes the domain and the conventions from DOMAIN.md and CONVENTIONS.md", async () => {
    const dir = await tempRepo({ "DOMAIN.md": "File domain.\n", "CONVENTIONS.md": "File conventions.\n", "SPEC.md": SPEC_WITH_SECTIONS });

    expect(await projectTexts(dir)).toEqual({ domain: "File domain.", conventions: "File conventions." });
  });

  test("takes them from the spec's Domain and Conventions sections when there is no file", async () => {
    const dir = await tempRepo({ "SPEC.md": SPEC_WITH_SECTIONS });

    expect(await projectTexts(dir)).toEqual({ domain: "## Domain\n\nSpec domain.", conventions: "## Conventions\n\nSpec conventions." });
  });

  test("takes them first from the files .oid.json names", async () => {
    const config = JSON.stringify({ paths: { domain: "docs/glossary.md", conventions: "docs/style.md" } });
    const dir = await tempRepo({ ".oid.json": config, "docs/glossary.md": "Named domain.\n", "docs/style.md": "Named conventions.\n", "DOMAIN.md": "File domain.\n" });

    expect(await projectTexts(dir)).toEqual({ domain: "Named domain.", conventions: "Named conventions." });
  });

  test("never takes them from AGENTS.md or CLAUDE.md, and gives none when the project has none", async () => {
    const dir = await tempRepo({ "AGENTS.md": "## Domain\n\nAgents domain.\n", "CLAUDE.md": "## Conventions\n\nClaude conventions.\n" });

    expect(await projectTexts(dir)).toEqual({});
  });
});
