import { describe, expect, test } from "vitest";
import { frText, noFrText, projectTexts } from "../../src/project-texts.ts";
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

describe("frText, in the other forms a spec gives an FR", () => {
  const TABLE_SPEC = `# x

| ID | Description |
|----|-------------|
| FR-NET-01 | Fetch URL content |

**FR-NET-01 — Fetch URL content**

- **Given** a URL
- **Then** its content

**FR-NET-02 — Web search**

Later.

### 4. Non-functional requirements
`;

  test("gives an FR that starts with a line in bold, up to the next such line", () => {
    expect(frText(TABLE_SPEC, "FR-NET-01")).toBe("**FR-NET-01 — Fetch URL content**\n\n- **Given** a URL\n- **Then** its content");
  });

  test("ends an FR in bold at the next heading", () => {
    expect(frText(TABLE_SPEC, "FR-NET-02")).toBe("**FR-NET-02 — Web search**\n\nLater.");
  });

  test("gives an FR under a heading of level 3", () => {
    expect(frText("### FR-A-01: A\nText of A.\n\n### FR-A-02: B\n", "FR-A-01")).toBe("### FR-A-01: A\nText of A.");
  });

  test("never takes a table's row for the FR's text", () => {
    expect(frText("| FR-NET-01 | Fetch URL content |\n", "FR-NET-01")).toBeUndefined();
  });
});

describe("noFrText", () => {
  test("names the FR, the spec and every form oid reads an FR in", () => {
    const message = noFrText("FR-GREET-01", "specs/SPEC.md");

    for (const part of ["FR-GREET-01", "specs/SPEC.md", "### FR-GREET-01:", "#### FR-GREET-01:", "**FR-GREET-01 — "]) expect(message).toContain(part);
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

  test("takes the sections from the spec where the project keeps it", async () => {
    const dir = await tempRepo({ "specs/SPEC.md": SPEC_WITH_SECTIONS, "SPEC.md": "# Another\n\n## Domain\n\nOther domain.\n" });

    expect(await projectTexts(dir, "specs/SPEC.md")).toEqual({ domain: "## Domain\n\nSpec domain.", conventions: "## Conventions\n\nSpec conventions." });
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
