import { execFile, execFileSync } from "node:child_process";
import { cp, mkdtemp, readdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

export const OID_ROOT = resolve(import.meta.dirname, "../..");
const GREET = join(OID_ROOT, "fixtures/greet");

/** Runs git in `dir` and returns its trimmed stdout. Global and system config are cut off in hooks.ts. */
export function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

/** A copy of the greet project in a new temporary git repository, with one commit and oid's node_modules linked in. */
export async function createGreetProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "oid-greet-"));
  await cp(join(GREET, "project"), dir, { recursive: true });
  await symlink(join(OID_ROOT, "node_modules"), join(dir, "node_modules"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Fixture");
  git(dir, "config", "user.email", "fixture@example.com");
  git(dir, "add", "--all", ":!node_modules");
  git(dir, "commit", "-q", "-m", "chore: greet project");
  return dir;
}

/** The directory of a prepared attempt of the greet project. */
export function attemptDir(name: string): string {
  return join(GREET, "attempts", name);
}

/** Every file under `dir`, relative to it. */
export async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(dir, join(entry.parentPath, entry.name)));
}

/** Local branches of the repository in `dir`. */
export function branches(dir: string): string[] {
  return git(dir, "branch", "--format=%(refname:short)").split("\n").filter(Boolean);
}

/** Checks `ref` out in a new temporary worktree and runs cucumber-js there on the scenarios tagged `tag`. */
export async function runScenariosAt(dir: string, ref: string, tag: string): Promise<{ exitCode: number; output: string }> {
  const checkout = await mkdtemp(join(tmpdir(), "oid-checkout-"));
  git(dir, "worktree", "add", "-q", "--detach", checkout, ref);
  await symlink(join(OID_ROOT, "node_modules"), join(checkout, "node_modules"));
  try {
    const { stdout, stderr } = await promisify(execFile)("npx", ["cucumber-js", "--tags", tag, "--format", "summary"], {
      cwd: checkout,
      env: { ...process.env, NODE_OPTIONS: "--import tsx" },
    });
    return { exitCode: 0, output: stdout + stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: failed.code ?? 1, output: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
  } finally {
    git(dir, "worktree", "remove", "--force", checkout);
  }
}
