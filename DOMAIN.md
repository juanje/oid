# Domain

What the words mean here, the formats oid reads and writes, and how the tools oid drives behave.

The tool behaviour below was observed on Pi 1.1.0, cucumber-js 13 and vitest 3. oid pins Pi 1.4.0, so check each Pi behaviour on 1.4.0 the first time you rely on it. Do the same for any other tool whose pinned version differs. Update this file when a behaviour changed.

## Terms

Each term has one meaning. The last column names what it must not be confused with.

| Term | Means | Not to be confused with |
|:--|:--|:--|
| **FR / NFR** | A requirement in `SPEC.md` (`FR-AREA-NN`, `NFR-NN`): what and why, never how to verify it. | — |
| **Feature file** | The `.feature` file with the scenarios of one FR. Say **FR** for the requirement and **feature file** for the file. | "Feature" on its own, which is ambiguous. |
| **Scenario** | A Gherkin `Scenario`: the acceptance criterion of an FR. | — |
| **Step** | A Gherkin step (`Given`, `When`, `Then`). | A *step definition*, or a *procedure step* (a numbered step of a prompt, such as Step 0). |
| **Step definition** | TypeScript that runs a step, with real assertions. | — |
| **Effective tags** | A scenario's own tags plus those of its `Feature` (and `Rule`). Traceability uses them. | Only the tag line above `Scenario:`. |
| **Contract** | `SPEC.md` and the approved feature files. Only the person changes them. | Step definitions and tests, which agents write. |
| **Run** | One `oid run`, with its own worktree, branch and log. | — |
| **Attempt** | One agent process that produces one diff of one kind. | A *session* (Pi's object; one per attempt) and a *turn* (one model response inside an attempt). |
| **Attempt kind** | steps, test, code, refactor-code or refactor-tests. Each has its own write boundary. | — |
| **Retry** | A new attempt after a refusal, from the last checkpoint, with the refusal in its task. | — |
| **Checkpoint** | A commit in the run's worktree after an accepted attempt: the rollback target. | Evidence. |
| **Valid Red** | A failure that shows the behaviour or the interface is missing (Red classes, below). | A failure that shows the test is broken. |
| **Broken version** | The code a new test must fail on: the previous checkpoint's code, or a mutant. | — |
| **Mutant** | A small change to lines a test covers. oid applies it, runs the test and undoes it. The agent proposes it and never writes it to the source. | — |
| **Evidence** | For a scenario or a test: the broken version it failed on, the class of the failure, and the code it passed on. | A checkpoint. |
| **Guard** | A scenario or test about something that must *not* happen, so it passes before any code exists. Its evidence is a mutant. | — |
| **Gate** | The deterministic checks that decide whether an FR is done. It runs as the loop step before each commit and as `oid gate`. | The evidence check of an attempt, and `try`. |
| **Baseline** | The gate's results at the start of a run. Lint, type and detector findings count only when they are new against it. | A failing test at the start, which stops the run. |
| **Regression** | A test or scenario that was green and turns red. | — |
| **Refusal** | oid's answer to an attempt it does not accept: what failed, the evidence, the next step. It ends the attempt. | A *denial*: one tool call blocked during an attempt. The attempt goes on. |
| **Report** | The structured end of an attempt, given with the `report` tool. | Free text in the agent's last message, which oid does not read. |
| **Shelved scenario** | A scenario the run cannot build as written. It is set aside with a proposed diff of its feature file, and the run goes on. | — |
| **Intervention** | Any input from the person during or after a run that changes its course or output. Counted by kind: contract, stuck, other. | — |
| **Finding / item** | A finding is one result of a detector: category, location, detail. An item is a group of findings fixed and checkpointed together. | — |
| **Wiring** | Code that connects parts that already exist. It is the missing piece when every unit test of a scenario is green and the scenario is still red. It is legal once the scenario has at least one unit test. | — |
| **Executor** | What runs an attempt's agent: Pi, or the scripted executor that returns prepared diffs and reports for oid's own tests. | A fake Pi SDK. Tests replace the executor, not Pi. |
| **D-NN** | A decision in `DECISIONS.md`. | — |

### Reading `~/git/outside-in-dev`

That codebase uses some of these words with other meanings. When you port a piece from it, translate them as follows.

| There | Here |
|:--|:--|
| `features` in `progress.json` | FRs |
| `cycle_step`, states such as `BDD_RED` and `CODE_GREEN` | attempt kinds; there is no cycle position |
| checkpoint in `.outside-in/checkpoints/<FR>.json` | evidence |
| return | a mutant that removes all of the cycle's code |
| `Rejection` | refusal |
| the Red gate (`oid verify red`), gate mode | the evidence check; not the gate |
| skip (`refs/oid/wip`) | shelve, without a proposal |
| override (`OID_OVERRIDE`) | none: there are no overrides |
| Jev | the decision model, not in scope |
| `ADR-NNN` | not decisions here |

## Red classes

| Class | Valid Red | Typical cause |
|:--|:--|:--|
| `business_assertion` | Yes | An assertion about behaviour fails. |
| `missing_implementation` | Yes | The source module or symbol under test does not exist yet, or the service under test does not answer yet. |
| `test_bug` | No | The test does not compile, a step is undefined or pending, or the test passes without new code. |
| `environment` | No | A package that is not installed, a misconfigured runner, a timeout. |
| undecided | — | None of the above can be told from the report. In the skeleton it is a refusal; in the MVP, a question to the person. |

- **A failure in a `Given` or `Background` step is never a Red.** The scenario failed while being set up. A failure in a `When` or `Then` step is judged by its message.
- **`ENOENT` reading something the code should produce is undecided.** Tests assert first that the output exists, then check its content, so that a missing behaviour fails as an assertion.
- **`X is not a function` is a valid Red only if `X` does not exist in the project.** Ask the compiler API. If `X` exists, the test may be using it wrongly.
- **An assertion that fails on a line the attempt did not add is undecided.**
- **A test that passes before its code is not a Red.** If it describes a guard, its evidence is a mutant.
- **A test that did not run is never evidence.** Check that the test asked for is in the report and ran before reading its result.

## Formats

### `SPEC.md` requirement headings

```markdown
#### FR-RUN-01: Run one FR on approved features
### NFR-01: Every refusal says what failed, the evidence and the next step
```

The patterns are `^#{3,4} (FR-[A-Z][A-Z0-9]*-\d{2,3}[a-z]?): (.+)$` and `^#{3,4} (NFR-\d{2,3}): (.+)$`. The body runs to the next heading of the same level or above. An FR split off another keeps its number and adds one lowercase letter.

A requirement holds no acceptance criteria: no `Scenario:` line, and no `Given` … `Then` sequence. A sentence that starts with "When" is not one.

### Feature files

```gherkin
@FR-SHORTEN-01
Feature: Shorten a URL

  Scenario: A valid URL gets a code of 6 to 8 characters
    Given an empty store
    When I shorten "https://example.com/very/long/path"
    Then I get a code of 6 to 8 URL-safe characters
```

One file per FR, with the tag on `Feature`. Scenarios describe observable behaviour: no internal function names, and no file layouts the user does not see.

### Refusal

```json
{
  "failed": "The new test passes on the code of the previous checkpoint",
  "evidence": "tests/unit/shorten.test.ts > \"rejects ftp URLs\" passed at checkpoint 4f2c1e0",
  "next": "If this test describes a guard, propose a mutant in your report; otherwise make it assert behaviour the code does not have yet"
}
```

None of the three parts may be empty. "Retry" is never the only next step.

### Finding

```json
{
  "id": "dup-0007",
  "category": "duplication",
  "file": "src/store.ts",
  "range": { "start": 12, "end": 31 },
  "detail": "20 duplicated lines",
  "related": [{ "file": "src/resolve.ts", "range": { "start": 8, "end": 27 } }]
}
```

Categories: `complexity`, `duplication`, `dead_code`, `magic_value`, `doc_drift`.

## How the tools behave

### Pi SDK

- **Provider errors do not reject.** `prompt()` and `classify()` resolve with `stopReason: "error"` and an `errorMessage`, on `message_end` for `prompt()`. Usage is present and cost is 0. An empty assistant response is also possible. Neither is success.
- **A tool call that ignores the abort signal never settles.** `prompt()` and `session.abort()` then never resolve. To enforce a time or cost limit, race `prompt()` against the limit and abandon the session.
- **Calling `abort()` from inside `beforeToolCall` or `afterToolCall` and awaiting it never settles.** Start it without awaiting.
- **The `tools` allowlist also filters custom tools.** A custom tool missing from it is never offered, and nothing says so.
- **`beforeToolCall` blocks a call when it returns `{ block: true, reason }`.** The reason reaches the model as the tool result. Chain to the previous handler, because Pi's extensions use the same hook.
- **`tool_execution_end` carries no `args`.** Pair it with `tool_execution_start` by `toolCallId`.
- **Without an explicit `agentDir`, Pi reads the user's `~/.pi/agent/settings.json`.** Always pass one.
- **`SessionManager.create(cwd, dir)` writes the transcript only from the first message.** Create the directory before the call.
- **Usage** is on each assistant `message_end`: `message.usage.totalTokens` and `message.usage.cost.total`.
- **A failed search returns ripgrep's stderr as an error result.** A filter that withholds lines it cannot attribute to a file must let error results through.

### cucumber-js

- **Formatters:** `message`, `html`, `pretty`, `progress`, `progress-bar`, `summary`. There is no `json` and no `junit`.
- **`--format message:<file>` writes Cucumber Messages as NDJSON.**
  - Step statuses: `PASSED`, `FAILED`, `UNDEFINED`, `PENDING`, `AMBIGUOUS`, `SKIPPED`.
  - A failure carries `exception.type` and `exception.message`.
  - The messages give each step's definition file and line.
- **A step file that statically imports a missing module stops cucumber before any scenario runs:** `ERR_MODULE_NOT_FOUND` on stderr, exit 1, and no message file. A dynamic import of a missing module fails only its step.
- **Select a scenario by location:** `features/x.feature:12`.
- **TypeScript steps need `NODE_OPTIONS="--import tsx"`.**
- **A regex step pattern inside a TypeScript string loses its backslashes unless they are doubled.** Use Cucumber expressions or regex literals.

### vitest

With `--reporter=json --outputFile=<file>`:

| Case | Where it appears | Message |
|:--|:--|:--|
| The test imports an export that does not exist | Test, `failureMessages` | `TypeError: (0 , generateCode) is not a function` |
| The test imports a module that does not exist | File, `message`, no tests listed | `Cannot find module '../../src/redirect' imported from '<test file>'` |
| A syntax error in a test file | File, `message`, no tests listed | `Transform failed with 1 error: …` |
| A failing expectation | Test, `failureMessages` | `AssertionError: expected 2 to be 4 // Object.is equality` |

- **A missing export does not fail the file load:** it arrives as `undefined`.
- **vitest does not type-check.** `tsc --noEmit` does.
- **Pass the test name as one argument: `--testNamePattern=<escaped name>`.** As two arguments, a name that starts with `-` is read as an option.
- **`passWithNoTests` makes a run where nothing ran pass.** Check that the test asked for ran.
- **`--exclude` on the command line is added to the configured excludes.** Use it to keep oid's own files out of a project's run.
- **On macOS the JSON report gives real paths** (`/private/var/…` for `/var/…`). Resolve both sides with `realpath` before you compute relative paths.

### git

- **`git checkout -- .` does not remove untracked files.** Roll back with `git reset --hard <checkpoint>`, then `git clean -fd` on the writable paths.
- **Worktrees share the project's hooks.** A `pre-commit` hook can refuse a checkpoint. Commit checkpoints with `-c core.hooksPath=/dev/null --no-verify`.
- **Worktrees do not share `node_modules`.** A symlinked `node_modules` is a file to git, so `node_modules/` (with the slash) does not ignore it.
- **`info/exclude` is shared by every worktree of a repository.** Writing to it changes the person's `git status`. Keep a symlinked `node_modules` out of oid's own git commands with a pathspec (`':(exclude)node_modules'`), and touch neither `info/exclude` nor `.gitignore`.
- **`git add` exits 1 when a pathspec names a path `.gitignore` ignores,** even an exclude pathspec, and it still stages the rest. List the changes with the exclude pathspec (`diff --name-only`, `ls-files --others`), then `git add` exactly those files.
- **A test fixture's git inherits the global config and hooks.** Isolate it.

### Node child processes

- **`spawnSync` blocks the event loop,** so time limits, `oid abort` and timers stop working while the child hangs. Use `spawn` in its own process group, with SIGTERM and then SIGKILL on a limit.
- **The exit code of a killed child depends on whether `sh -c` execs the command.** Run `exec <command>` when the code depends on it.
- **A hung runner holds every lock taken around it.** A refusal about a lock names the holder's PID.
- **A check can time out on a slow machine.** Give limits slack. A timeout is an `environment` failure, not a verdict on the code.
- **Wall time includes suspends.** Measure active time.

### TypeScript

- **TypeScript 7's `typescript` package has no JavaScript compiler API:** no `createProgram` and no `createSourceFile`; it ships the native `tsc`. For the compiler API (symbol checks, detectors), add TypeScript 6 under an alias, `"typescript-api": "npm:typescript@6.0.3"`, and import from `typescript-api`. Keep `typescript` 7 for `tsc --noEmit`.

### Paths and secrets

- **`os.homedir()` follows `$HOME`.** The account's real home is `os.userInfo().homedir`, which throws when the account has no passwd entry.
- **Resolve symlinks before checking for secrets.** Match secret-shaped names (`.env.alias`), not only exact ones.

## Edge cases

- **A suite can go green without the code working.**
  - `.only` or `.skip` in a test;
  - a branch on a test environment (`process.env.VITEST`);
  - a loosened runner, type or lint config.

  Refuse these patterns in added lines. The gate's configuration is unwritable.
- **A simpler test can stop testing anything.** A changed test must still fail on a mutant of the current code.
- **A helper used once adds indirection.** A new exported symbol needs two references.
- **An agent that writes a program as a string with `"\\n"` gets a backslash and an `n`, not a line break.** The script is invalid, and the test looks like a valid Red that no code can pass. Write programs as template literals.
- **An unknown option that is silently ignored makes a check lie.** Every command rejects unknown options.

## Testing oid itself

- **Scenarios and unit tests drive attempts with the scripted executor.** Each attempt is given a prepared diff and report. Real Pi runs only in one smoke scenario and in real runs.

- **Scenarios assert milestones.** Never where a run ends, or a message word for word.
- **A recorded runner reply checks the request it answers,** not only its position in the call order.
- **Use one real runner per kind of check; record the rest.**
- **Test git, child-process and Pi behaviour against the real tool at least once.** Recorded replies do not show it.
