import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import type { EndEvent } from "../../src/run-log.ts";
import { GREET_01_SCENARIO, attemptDir, git } from "../support/fixture.ts";
import { runLog, scriptedModel } from "../support/run.ts";
import type { Probe } from "../support/scripted-model.ts";
import type { RunWorld } from "../support/world.ts";

const SECRET = "sesame-7f3a9c";
const OUTSIDE_LINK = "docs/outside-link.txt";

/** The file outside the run's worktree, per scenario: its path and what it held. */
const outsideFiles = new WeakMap<RunWorld, { file: string; content: string }>();

function outsideFile(world: RunWorld): { file: string; content: string } {
  const outside = outsideFiles.get(world);
  assert.ok(outside !== undefined, "No file outside the worktree");
  return outside;
}

Given("a file outside the run's worktree holds a secret", async function (this: RunWorld) {
  const file = join(await realpath(await mkdtemp(join(tmpdir(), "oid-outside-"))), "secret.txt");
  const content = `TOKEN=${SECRET}\n`;
  await writeFile(file, content);
  outsideFiles.set(this, { file, content });
});

Given("the project has a committed symlink to that file", async function (this: RunWorld) {
  await mkdir(join(this.projectDir, dirname(OUTSIDE_LINK)), { recursive: true });
  await symlink(outsideFile(this).file, join(this.projectDir, OUTSIDE_LINK));
  git(this.projectDir, "add", OUTSIDE_LINK);
  git(this.projectDir, "commit", "-q", "-m", "docs: a link to a file elsewhere");
});

Given("the project has a committed .env that holds a secret", async function (this: RunWorld) {
  await writeFile(join(this.projectDir, ".env"), `TOKEN=${SECRET}\n`);
  git(this.projectDir, "add", ".env");
  git(this.projectDir, "commit", "-q", "-m", "chore: local settings");
});

Given("the project has a committed .oid\\/progress.json", async function (this: RunWorld) {
  await mkdir(join(this.projectDir, ".oid"), { recursive: true });
  await writeFile(join(this.projectDir, ".oid/progress.json"), `{ "frs": {} }\n`);
  git(this.projectDir, "add", ".oid");
  git(this.projectDir, "commit", "-q", "-m", "chore: oid's state");
});

Given(
  "the scripted model's steps attempt first reads .oid\\/progress.json, lists the worktree and finds all its files, then builds FR-GREET-01",
  function (this: RunWorld) {
    this.probed = [".oid/progress.json"];
    buildsWithProbes(this, [callOf("read", ".oid/progress.json"), callOf("ls", "."), { tool: "find", args: { pattern: "**/*" } }]);
  },
);

Then("the model was told the read of .oid\\/progress.json was refused, naming the path and why", function (this: RunWorld) {
  const [answer] = probeResults(this);
  assert.ok(answer?.includes(".oid/progress.json"), `The answer to reading .oid/progress.json does not name it:\n${answer}`);
  assert.match(answer!, /refused/i, `The answer to reading .oid/progress.json does not say it was refused:\n${answer}`);
});

Then("no listing or search the model got names anything under .oid", function (this: RunWorld) {
  for (const answer of probeResults(this).slice(1)) {
    for (const line of answer.split("\n")) assert.ok(!/(^|\/)\.oid(\/|$)/.test(line), `A listing or search named oid's state: ${line}\n${answer}`);
  }
});

/** The path a phrase of the feature names, as the model would write it. */
function pathFor(world: RunWorld, phrase: string): string {
  const { file } = outsideFile(world);
  const paths: Record<string, string> = {
    "the file's absolute path": file,
    "a path from ~ that leads to the file": `~/${relative(homedir(), file)}`,
    "the symlink": OUTSIDE_LINK,
    "the directory that holds the file": dirname(file),
  };
  assert.ok(paths[phrase] !== undefined, `No path for "${phrase}"`);
  return paths[phrase];
}

/** A call of `tool` on `path`, with the other arguments it needs. */
function callOf(tool: string, path: string): Probe {
  const args: Record<string, Probe["args"]> = {
    read: { path },
    write: { path, content: "overwritten\n" },
    edit: { path, edits: [{ oldText: SECRET, newText: "changed" }] },
    grep: { pattern: SECRET, path },
    ls: { path },
    find: { pattern: "*", path },
  };
  assert.ok(args[tool] !== undefined, `No call for the tool ${tool}`);
  return { tool, args: args[tool] };
}

/** FR-GREET-01's attempts, the steps attempt making `probes` first. */
function buildsWithProbes(world: RunWorld, probes: Probe[]): void {
  scriptedModel(world).script = (["steps", "test", "code"] as const).map((kind) => ({
    kind,
    scenario: GREET_01_SCENARIO,
    dir: attemptDir(kind),
    ...(kind === "steps" ? { probes } : {}),
  }));
}

Given("the scripted model's steps attempt first calls {word} on {}, then builds FR-GREET-01", function (this: RunWorld, tool: string, phrase: string) {
  this.probed = [pathFor(this, phrase)];
  buildsWithProbes(this, [callOf(tool, this.probed[0]!)]);
});

Given(
  "the scripted model's steps attempt first reads .env and .git, lists the worktree, finds all its files and searches it for the secret, then builds FR-GREET-01",
  function (this: RunWorld) {
    this.probed = [".env", ".git"];
    buildsWithProbes(this, [callOf("read", ".env"), callOf("read", ".git"), callOf("ls", "."), { tool: "find", args: { pattern: "**/*" } }, { tool: "grep", args: { pattern: SECRET } }]);
  },
);

/** What the tools answered the steps attempt's probes, in order. */
function probeResults(world: RunWorld): string[] {
  const requests = scriptedModel(world).attempts[0] ?? [];
  assert.ok(requests.length > 1, "The steps attempt's agent was not asked again after its probes");
  return requests[1]!.toolResults;
}

Then("the model was told that call was refused, naming the path and why", function (this: RunWorld) {
  const [answer] = probeResults(this);
  assert.ok(answer?.includes(this.probed[0]!), `The answer to the call does not name ${this.probed[0]}:\n${answer}`);
  assert.match(answer!, /refused/i, `The answer to the call does not say it was refused:\n${answer}`);
});

Then("the model was told the reads of .env and .git were refused, naming each path and why", function (this: RunWorld) {
  const answers = probeResults(this);
  for (const [index, path] of [".env", ".git"].entries()) {
    assert.ok(answers[index]?.includes(path), `The answer to reading ${path} does not name it:\n${answers[index]}`);
    assert.match(answers[index]!, /refused/i, `The answer to reading ${path} does not say it was refused:\n${answers[index]}`);
  }
});

Then("the secret never reached the model", function (this: RunWorld) {
  for (const [index, requests] of scriptedModel(this).attempts.entries()) {
    for (const request of requests) {
      const seen = [request.task, ...request.toolResults].join("\n");
      assert.ok(!seen.includes(SECRET), `Attempt ${index + 1}'s agent saw the secret:\n${seen}`);
    }
  }
});

Then("the file outside the worktree is unchanged", function (this: RunWorld) {
  const { file, content } = outsideFile(this);
  assert.equal(readFileSync(file, "utf8"), content, "The file outside the worktree changed");
});

Then("no listing or search the model got names .env or anything under .git", function (this: RunWorld) {
  for (const answer of probeResults(this).slice(2)) {
    for (const line of answer.split("\n")) {
      assert.ok(!/(^|\/)\.env\b/.test(line) && !/(^|\/)\.git(\/|$|:|-\d)/.test(line), `A listing or search named a hidden file: ${line}\n${answer}`);
    }
  }
});

Then("the run's log counts {int} denied tool call(s)", async function (this: RunWorld, denied: number) {
  const end = (await runLog(this)).find((event): event is EndEvent => event.event === "end");
  assert.ok(end !== undefined, "The run's log has no measures");
  assert.equal(end.measures.deniedToolCalls, denied, "The run's log counts another number of denied tool calls");
});
