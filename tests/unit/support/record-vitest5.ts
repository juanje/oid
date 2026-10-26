// Records, against the real tools, what a project on vitest 5 gives oid (tests/unit/recorded/vitest5-greet): vitest
// 5.0.3's JSON report of failing tests and its coverage of passing ones, and a cucumber-js run's V8 coverage under tsx
// with the code oid's capture hook kept. Paths under the project are written as /work.
// Re-record with: npm ci --prefix fixtures/vitest5 && node --import tsx tests/unit/support/record-vitest5.ts
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SOURCE_CAPTURE, sourceCaptureEnv } from "../../../src/source-capture.ts";

const OID_ROOT = join(import.meta.dirname, "../../..");
const OUT = join(OID_ROOT, "tests/unit/recorded/vitest5-greet");
const VITEST_5 = join(OID_ROOT, "fixtures/vitest5/node_modules");

const FILES: Record<string, string> = {
  "package.json": '{ "type": "module" }\n',
  "src/greet.ts": `export function greet(name: string): string {
  if (name === "") return "Hello, stranger!";
  return name === "Ada" ? "Hello, Ada!" : \`Hello, \${name}!\`;
}

export function farewell(name: string): string {
  return \`Goodbye, \${name}!\`;
}

export async function later(name: string): Promise<string> {
  return greet(name);
}
`,
  "tests/unit/greet.test.ts": `import { expect, test } from "vitest";
import { greet } from "../../src/greet.ts";

test("greets Grace", () => {
  expect(greet("Grace")).toBe("Hello, Grace!");
});
`,
  "tests/unit/failing.test.ts": `import { expect, test } from "vitest";
import { farewel, later } from "../../src/greet.ts";

test("asks for a function the module does not export", () => {
  expect(farewel("Ada")).toBe("Goodbye, Ada!");
});

test("asserts after .resolves", async () => {
  await expect(later("Ada")).resolves.toBe("Hi, Ada!");
});
`,
  "features/greet.feature": `Feature: Greet
  Scenario: Ada is greeted
    When I greet "Ada"
`,
  "features/steps/greet.steps.ts": `import { When } from "@cucumber/cucumber";

When("I greet {string}", async (name: string) => {
  const { greet } = await import("../../src/greet.ts");
  greet(name);
});
`,
  "cucumber.mjs": 'export default { import: ["features/steps/**/*.ts"] };\n',
};

const root = realpathSync(mkdtempSync(join(tmpdir(), "oid-vitest5-")));
for (const [path, content] of Object.entries(FILES)) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
mkdirSync(join(root, "node_modules"));
symlinkSync(join(VITEST_5, "vitest"), join(root, "node_modules/vitest"));
symlinkSync(join(VITEST_5, "@vitest"), join(root, "node_modules/@vitest"));
for (const name of ["@cucumber", "tsx"]) symlinkSync(join(OID_ROOT, "node_modules", name), join(root, "node_modules", name));

const run = (command: string, args: string[], env: Record<string, string> = {}) => {
  try {
    execFileSync(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: "pipe" });
  } catch {}
};
const vitest = join(root, "node_modules/vitest/vitest.mjs");
const work = (text: string) => text.split(root).join("/work");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "scenario-v8"), { recursive: true });

run(process.execPath, [vitest, "run", "tests/unit/failing.test.ts", "--reporter=json", `--outputFile=${join(root, "report.json")}`]);
writeFileSync(join(OUT, "unit-report.json"), work(readFileSync(join(root, "report.json"), "utf8")));

const coverage = join(root, "coverage");
run(process.execPath, [vitest, "run", "tests/unit/greet.test.ts", "--coverage.enabled", "--coverage.provider=v8", "--coverage.reporter=json", `--coverage.reportsDirectory=${coverage}`, "--coverage.include=src/**"]);
writeFileSync(join(OUT, "unit-coverage.json"), work(readFileSync(join(coverage, "coverage-final.json"), "utf8")));

const v8 = join(root, "v8");
mkdirSync(v8);
run(join(OID_ROOT, "node_modules/.bin/cucumber-js"), [], { NODE_V8_COVERAGE: v8, NODE_OPTIONS: `--import tsx --import ${SOURCE_CAPTURE}`, ...sourceCaptureEnv(v8, ["src/"]) });
for (const name of readdirSync(v8)) {
  const content = JSON.parse(readFileSync(join(v8, name), "utf8"));
  // Of Node's own coverage, only the project's source: the rest weighs megabytes and oid reads none of it.
  if (Array.isArray(content.result)) {
    content.result = content.result.filter((script: { url: string }) => script.url.includes(`${root}/src/`));
    if (content.result.length === 0) continue;
    delete content["source-map-cache"];
  }
  writeFileSync(join(OUT, "scenario-v8", name.startsWith("coverage-") ? "coverage-1.json" : name), work(JSON.stringify(content)));
}
mkdirSync(join(OUT, "src"));
writeFileSync(join(OUT, "src/greet.ts"), FILES["src/greet.ts"]!);
rmSync(root, { recursive: true, force: true });
process.stdout.write(`Recorded in ${OUT}\n`);
