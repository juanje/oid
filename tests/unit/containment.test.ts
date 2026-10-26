import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { toolCallRefusal, withoutHidden } from "../../src/containment.ts";

let worktree = "";
let outside = "";
beforeAll(async () => {
  worktree = await realpath(await mkdtemp(join(tmpdir(), "oid-contain-")));
  outside = await realpath(await mkdtemp(join(tmpdir(), "oid-outside-")));
  await writeFile(join(outside, "secret.txt"), "sesame\n");
  await mkdir(join(worktree, "src"));
  await writeFile(join(worktree, "src/greet.ts"), "export {};\n");
  await writeFile(join(worktree, ".env"), "SECRET=sesame\n");
  await writeFile(join(worktree, ".git"), "gitdir: /elsewhere\n");
  await symlink(join(outside, "secret.txt"), join(worktree, "src/link.txt"));
  await symlink(join(worktree, ".env"), join(worktree, "src/settings.txt"));
});

describe("toolCallRefusal", () => {
  test("refuses a path outside the worktree, by its absolute path or a path from ~, naming the path and why", () => {
    const fromHome = `~/${relative(homedir(), join(outside, "secret.txt"))}`;
    for (const path of [join(outside, "secret.txt"), fromHome]) {
      const refusal = toolCallRefusal(worktree, "read", { path });

      expect(refusal?.evidence).toContain(path);
      expect(refusal?.evidence).toMatch(/outside the run's worktree/);
    }
  });

  test("refuses a symlink in the worktree that leads out of it, and a new file in a directory outside it", () => {
    expect(toolCallRefusal(worktree, "edit", { path: "src/link.txt" })?.evidence).toMatch(/outside the run's worktree/);
    expect(toolCallRefusal(worktree, "write", { path: join(outside, "new/file.ts") })?.evidence).toMatch(/outside the run's worktree/);
  });

  test("refuses every path-like argument that leads out: ls's and find's path, find's pattern, grep's path and glob", () => {
    expect(toolCallRefusal(worktree, "ls", { path: outside })).toBeDefined();
    expect(toolCallRefusal(worktree, "find", { pattern: "*", path: outside })).toBeDefined();
    expect(toolCallRefusal(worktree, "find", { pattern: "../**" })).toBeDefined();
    expect(toolCallRefusal(worktree, "find", { pattern: `${outside}/*` })).toBeDefined();
    expect(toolCallRefusal(worktree, "grep", { pattern: "sesame", path: outside })).toBeDefined();
    expect(toolCallRefusal(worktree, "grep", { pattern: "sesame", glob: "../**/*.txt" })).toBeDefined();
  });

  test("refuses a secret-shaped name in the worktree, by its name or by where a symlink leads, naming the path and why", () => {
    const names = [".env", ".env.local", ".npmrc", "web/.netrc", "certs/site.pem", "site.key", "id.p12", "id.pfx", "auth.json", "config/secrets/db.txt"];
    for (const path of names) expect(toolCallRefusal(worktree, "read", { path })?.evidence, path).toMatch(/secret/);
    const refusal = toolCallRefusal(worktree, "read", { path: "src/settings.txt" });
    expect(refusal?.evidence).toContain("src/settings.txt");
    expect(refusal?.evidence).toMatch(/secret/);
  });

  test("refuses .git, which in a worktree is a file, and anything under it", () => {
    expect(toolCallRefusal(worktree, "read", { path: ".git" })?.evidence).toMatch(/\.git/);
    expect(toolCallRefusal(worktree, "read", { path: ".git/config" })).toBeDefined();
  });

  test("refuses .oid, oid's own state, and anything under it, naming the path and why", () => {
    expect(toolCallRefusal(worktree, "read", { path: ".oid/progress.json" })?.evidence ?? "").toMatch(/\.oid\/progress\.json: .*oid's/);
    expect(toolCallRefusal(worktree, "ls", { path: ".oid" })).toBeDefined();
  });

  test("lets every other path in the worktree through, written as Pi accepts it", () => {
    for (const path of ["src/greet.ts", "@src/greet.ts", join(worktree, "src/greet.ts"), "src/new/file.ts", "."]) {
      expect(toolCallRefusal(worktree, "read", { path }), path).toBeUndefined();
    }
    expect(toolCallRefusal(worktree, "find", { pattern: "**/*.ts" })).toBeUndefined();
    expect(toolCallRefusal(worktree, "grep", { pattern: "x", glob: "*.ts" })).toBeUndefined();
    expect(toolCallRefusal(worktree, "try", { scenario: true })).toBeUndefined();
  });
});

describe("withoutHidden", () => {
  test("leaves secret-shaped files and .git out of what ls, find and grep answer", () => {
    expect(withoutHidden("ls", ".env\n.git\nsrc/\nsub/")).toBe("src/\nsub/");
    expect(withoutHidden("find", ".env\n.git\nsrc/\nsrc/a.ts\nsub/.npmrc")).toBe("src/\nsrc/a.ts");
    const grep = 'src/a.ts:1: export const a = "sesame";\nsrc/a.ts-2- \n.env:1: SECRET=sesame-42\n.env-2- \nsub/.npmrc:1: sesame too\n[100 matches limit reached]';
    expect(withoutHidden("grep", grep)).toBe('src/a.ts:1: export const a = "sesame";\nsrc/a.ts-2- \n[100 matches limit reached]');
  });

  test("leaves oid's state out of what ls, find and grep answer", () => {
    expect(withoutHidden("ls", ".oid/\nsrc/")).toBe("src/");
    expect(withoutHidden("find", ".oid/progress.json\nsrc/a.ts")).toBe("src/a.ts");
    expect(withoutHidden("grep", '.oid/progress.json:1: { "frs": {} }\nsrc/a.ts:1: x')).toBe("src/a.ts:1: x");
  });

  test("leaves what other tools answer as it is", () => {
    expect(withoutHidden("read", ".env\n")).toBe(".env\n");
  });
});
