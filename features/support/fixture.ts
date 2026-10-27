import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { installRunners } from "./runners.ts";

export const OID_ROOT = resolve(import.meta.dirname, "../..");
const GREET = join(OID_ROOT, "fixtures/greet");

/** Runs git in `dir` and returns its trimmed stdout. Global and system config are cut off in hooks.ts. */
export function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

/** A copy of the greet project in a new temporary git repository, with one commit and the recorded runners installed. */
export async function createGreetProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "oid-greet-"));
  await cp(join(GREET, "project"), dir, { recursive: true });
  await installRunners(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Fixture");
  git(dir, "config", "user.email", "fixture@example.com");
  git(dir, "add", "--all");
  git(dir, "commit", "-q", "-m", "chore: greet project");
  return dir;
}

/** The greet project with FR-GREET-01 built and committed, then another FR's approved contract committed. */
export async function createGreetProjectWith(fr: "greet-02" | "greet-03", options: { greet02Built?: boolean } = {}): Promise<string> {
  const dir = await createGreetProject();
  for (const attempt of ["steps", "test", "code"]) await cp(attemptDir(attempt), dir, { recursive: true });
  git(dir, "add", "--all");
  git(dir, "commit", "-q", "-m", "feat(FR-GREET-01): greet a person by name");
  if (options.greet02Built === true) {
    await cp(join(GREET, "greet-02", "contract"), dir, { recursive: true });
    for (const attempt of ["s2-steps", "s1-test", "s2-test", "s2-code"]) await cp(greet02AttemptDir(attempt), dir, { recursive: true });
    git(dir, "add", "--all");
    git(dir, "commit", "-q", "-m", "feat(FR-GREET-02): greet a group of people");
  }
  await cp(join(GREET, fr, "contract"), dir, { recursive: true });
  git(dir, "add", "--all");
  git(dir, "commit", "-q", "-m", `spec: ${fr}`);
  return dir;
}

/** The directory of a prepared attempt for FR-GREET-02. */
export function greet02AttemptDir(name: string): string {
  return join(GREET, "greet-02", "attempts", name);
}

/** The directory of a prepared attempt for FR-GREET-03. */
export function greet03AttemptDir(name: string): string {
  return join(GREET, "greet-03", "attempts", name);
}

/** The names of the scenarios of a fixture feature file, in file order. */
export function scenarioNames(featureFile: string): string[] {
  return [...readFileSync(join(GREET, featureFile), "utf8").matchAll(/^\s*Scenario: (.+)$/gm)].map((match) => match[1]!);
}

/** The one scenario of FR-GREET-01, which the greet project starts with. */
export const GREET_01_SCENARIO = scenarioNames("project/features/greet-01.feature")[0]!;

/** The names of the vitest tests in `file`, in file order. */
export function testNames(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/\btest\("([^"]+)"/g)].map((match) => match[1]!);
}

/** Gives a fixture checkout the runners and libraries oid itself is tested with. */
async function linkOidNodeModules(dir: string): Promise<void> {
  await symlink(join(OID_ROOT, "node_modules"), join(dir, "node_modules"));
}

/** The directory of a prepared attempt of the greet project. */
export function attemptDir(name: string): string {
  return join(GREET, "attempts", name);
}

/** The directory of a prepared attempt or committed source of the refactor scenarios (FR-REF-01, FR-REF-02). */
export function refDir(name: string): string {
  return join(GREET, "ref", name);
}

/** Copies a fixture directory over the project and commits it, as code the project had before the run. */
export async function commitFixture(dir: string, fixture: string, message: string): Promise<void> {
  await cp(fixture, dir, { recursive: true });
  git(dir, "add", "--all");
  git(dir, "commit", "-q", "-m", message);
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
  return runAt(dir, ref, ["cucumber-js", "--tags", tag, "--format", "summary"]);
}

/** Checks `ref` out in a new temporary worktree and runs the type check there. */
export async function typeCheckAt(dir: string, ref: string): Promise<{ exitCode: number; output: string }> {
  return runAt(dir, ref, ["tsc", "--noEmit"]);
}

/** Runs `npx <args>` in a new temporary worktree of `ref`, with the real tools oid itself is tested with. */
async function runAt(dir: string, ref: string, args: string[]): Promise<{ exitCode: number; output: string }> {
  const checkout = await mkdtemp(join(tmpdir(), "oid-checkout-"));
  git(dir, "worktree", "add", "-q", "--detach", checkout, ref);
  await linkOidNodeModules(checkout);
  try {
    const { stdout, stderr } = await promisify(execFile)("npx", args, {
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

/** Changes the project's .oid.json with `change`, keeping the rest, and commits it, as the person would. */
export async function commitProjectConfig(dir: string, change: (config: Record<string, any>) => void, message: string): Promise<void> {
  const path = join(dir, ".oid.json");
  const config = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  change(config);
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
  git(dir, "add", ".oid.json");
  git(dir, "commit", "-q", "-m", message);
}
