# Domain

Context an agent cannot discover from the code: what the words mean here, the formats oid reads and writes, and how the tools oid drives actually behave. Most of it was learned in oid v1 (`juanje/outside-in-dev`, up to v0.12.6), usually from a failure.

Sections marked *observed in v1* were seen on Pi 1.1.0, cucumber-js 13 and vitest 3. Check them again on the versions v2 pins, and change this file when an upgrade changes a behaviour.

## Words that mean one thing here

Several words had two meanings in v1 and caused real confusion. Each term below has one meaning in v2. Where v1 used a word differently, the last column says so.

| Term | Means in v2 | Not to be confused with |
|:--|:--|:--|
| **FR / NFR** | A functional or non-functional requirement in `SPEC.md` (`FR-AREA-NN`, `NFR-NN`). It states what and why, never how to verify it. | — |
| **Feature file** | A `.feature` file with the scenarios of one FR. | "Feature" on its own. v1's `progress.json` called FRs "features", so "the feature" meant either. In v2, say **FR** for the requirement and **feature file** for the file. |
| **Scenario** | A Gherkin `Scenario`, the acceptance criterion of an FR. | — |
| **Step** | A Gherkin step (`Given`, `When`, `Then`). | Three other "steps": a *step definition*; a *procedure step* (a numbered step of a prompt, as in "Step 0"); and v1's *cycle step* (`bdd_red`, `tdd_green`…), which v2 does not have. "Step" alone always means a Gherkin step. |
| **Step definition** | TypeScript that runs a step, with real assertions. | — |
| **Effective tags** | A scenario's own tags plus those inherited from its `Feature` (and `Rule`). Traceability uses effective tags. | The scenario's own tags only. v1 bugs came from reading only the line above `Scenario:`. |
| **Contract** | `SPEC.md` and the approved feature files. Only the person changes them. | Step definitions and tests, which agents write. |
| **Run** | One `oid run`, with its own worktree, branch and log. | — |
| **Attempt** | One agent process that produces one diff of one kind. | A *session* (Pi's object; one per attempt) and a *turn* (one model response inside an attempt). |
| **Attempt kind** | steps, test, code, refactor-code or refactor-tests. Each has its own write boundary. | v1's states (`BDD_RED`, `CODE_GREEN`…). |
| **Retry** | A new attempt after a refusal, from the last checkpoint, with the refusal in its task. | — |
| **Checkpoint** | A commit in the run's worktree after an accepted attempt: the rollback target. | v1 also used "checkpoint" for `.outside-in/checkpoints/<FR>.json`, the record of a feature's last verification. In v2 that record is **evidence**. |
| **Valid Red** | A failure that shows the behaviour or the interface is missing (table below). | A failure that shows the test is broken. |
| **Broken version** | The code a new test must fail on: the previous checkpoint's code, or a mutant. | — |
| **Mutant** | A small change to lines a test covers. oid applies it, runs the test and undoes it. The agent proposes it, and never writes it to the source. | v1's *return*, a coarse mutant: oid removed all of the cycle's code to see the test fail. |
| **Evidence** | For a scenario or test: the broken version it failed on, the class of that failure, and the code it passed on. | — |
| **Guard** | A scenario or test about something that must *not* happen, so it passes before any code exists. Its evidence is a mutant. | In v1 a person had to accept it. |
| **Gate** | The deterministic checks that decide whether an FR is done. It is one function, run by the loop before each commit and by `oid gate`. | v1 used "gate" for the condition of each state, called `oid verify red` "the Red gate", and called the hook-driven mode "gate mode". In v2 the evidence check and `try` are not "the gate". |
| **Baseline** | The gate's results at the start of a run. Lint, type and detector findings count only when they are new against it. | A *red baseline*: a failing test at the start, which stops the run. |
| **Regression** | A test or scenario that was green and turns red. | — |
| **Refusal** | oid's answer to an attempt it does not accept: what failed, the evidence, the next step. | A *denial*, a single tool call blocked during an attempt. A denial does not end the attempt; a refusal does. v1 called refusals "rejections" (the `Rejection` type). |
| **Report** | The structured end of an attempt, through the `report` tool. | Free text in the agent's last message, which oid does not read. |
| **Shelved scenario** | A scenario the run cannot build as written. It is set aside with a proposed diff of its feature file, and the run goes on. | v1's *skip*, which parked a scenario under `refs/oid/wip` with no proposal. |
| **Intervention** | Any input from the person during or after a run that changes its course or output. Counted by kind: contract, stuck, other. | v1's *override*: the orchestrating session bypassing the hook with `OID_OVERRIDE`. v2 has no overrides. |
| **Finding / item** | A finding is one result of a detector (category, location, detail). An item is a group of findings fixed together and checkpointed together. | — |
| **Wiring** | The missing piece when every unit test of a scenario is green and the scenario is still red: the parts exist but are not connected. It is legal only after the scenario has at least one unit test. | — |
| **Decision model** | A future "System One" classifier for micro-decisions. | "Jev", one candidate model. Name the function, not the product. |
| **Executor** | What runs an attempt's agent. Pi is the first executor. | — |
| **D-NN** | A decision in `DECISIONS.md`. | v1's `ADR-NNN`, which are history, not v2 decisions. |

## Red classes

| Class | Valid Red | Typical cause |
|:--|:--|:--|
| `business_assertion` | Yes | An assertion about behaviour fails. |
| `missing_implementation` | Yes | The source module or symbol under test does not exist yet, or the service under test does not answer yet. |
| `test_bug` | No | The test does not compile, a step is undefined or pending, or it passes without new code. |
| `environment` | No | A package that is not installed, a runner that is misconfigured, a timeout. |
| undecided | — | None of the above can be told from the report. In the skeleton it is a refusal; in the MVP, a question to the person. |

Rules learned in v1:
- **A failure in a `Given` or `Background` step is never a Red.** The scenario failed while being set up, so it says nothing about the behaviour. A failure in a `When` or `Then` step is judged by its message.
- **`ENOENT` reading something the code should produce is undecided.** Tests should first assert that the output exists, then check its content. A missing behaviour then fails as an assertion, which oid accepts by itself. Without that order, three of five Reds in one v1 run had to go to the person.
- **`X is not a function` is a valid Red only if `X` does not exist in the project.** Only the compiler API can tell. If `X` exists, the test may be using it wrongly.
- **An assertion that fails on a line this attempt did not add is undecided.** It may be an old test, not the new one.
- **A test that passes before its code is not a Red**, however reasonable it looks. If it describes a guard, its evidence is a mutant.
- **A test that never ran is never evidence.** Check that the test asked for exists in the report and ran before reading its result.

## Formats

### `SPEC.md` requirement headings

```markdown
### FR-RUN-01: Run one FR on approved features
### NFR-01: Every refusal says what failed, the evidence and the next step
```

Patterns: `^#{3,4} (FR-[A-Z][A-Z0-9]*-\d{2,3}[a-z]?): (.+)$` and `^#{3,4} (NFR-\d{2,3}): (.+)$`. The body runs to the next heading of the same level or above. An FR id may end in one lowercase letter when a requirement is split off an existing one and keeps its number. A requirement holds no acceptance criteria: no `Scenario:` line and no `Given` … `Then` sequence. An ordinary sentence that starts with "When" is not one.

### Feature files

```gherkin
@FR-SHORTEN-01
Feature: Shorten a URL

  Scenario: A valid URL gets a code of 6 to 8 characters
    Given an empty store
    When I shorten "https://example.com/very/long/path"
    Then I get a code of 6 to 8 URL-safe characters
```

One file per FR, with the tag on `Feature`. Scenarios describe observable behaviour: no internal function names, no file layouts the user does not see.

### Refusal

```json
{
  "failed": "The new test passes on the code of the previous checkpoint",
  "evidence": "tests/unit/shorten.test.ts > \"rejects ftp URLs\" passed at checkpoint 4f2c1e0",
  "next": "If this test describes a guard, propose a mutant in your report; otherwise make it assert behaviour the code does not have yet"
}
```

None of the three parts may be empty, and "retry" is never the only next step.

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

## How the tools behave (*observed in v1*)

### Pi SDK

- **Provider errors do not reject.** `prompt()` and `classify()` resolve with `stopReason: "error"` and an `errorMessage`, on `message_end` for `prompt()`, with usage present and cost 0. An empty assistant response is also possible. Neither is success.
- **A tool call that ignores the abort signal never settles.** `prompt()` then never resolves, and `session.abort()` itself never resolves either. A caller that must enforce a time or cost limit races `prompt()` against its own limit and abandons the session.
- **`abort()` from inside `beforeToolCall` or `afterToolCall`, awaited, never settles,** because the hook is the running tool call that `abort()` waits for. Start it without awaiting.
- **The `tools` allowlist also filters custom tools.** A custom tool missing from the allowlist is silently never offered.
- **`beforeToolCall` can block a call** by returning `{ block: true, reason }`; the reason reaches the model as the tool result. Pi's extensions use the same hook, so chain to the previous handler.
- **`tool_execution_end` carries no `args`.** Pair it with `tool_execution_start` by `toolCallId`.
- **Without an explicit `agentDir`, Pi reads the user's `~/.pi/agent/settings.json`.**
- **`SessionManager.create(cwd, dir)` writes the transcript only from the first message.** The directory must exist before the call.
- **Usage** is on each assistant `message_end`: `message.usage.totalTokens` and `message.usage.cost.total`.
- **A search that fails returns ripgrep's stderr as an error result.** A filter that withholds lines it cannot attribute to a file must let error results through, or the agent never learns its pattern was wrong.

### cucumber-js 13

- **Formatters:** `message`, `html`, `pretty`, `progress`, `progress-bar`, `summary`. There is no `json` and no `junit`.
- **`--format message:<file>` writes Cucumber Messages as NDJSON.** Step statuses are `PASSED`, `FAILED`, `UNDEFINED`, `PENDING`, `AMBIGUOUS`, `SKIPPED`; a failure carries `exception.type` and `exception.message`. The messages also give each step's definition file and line.
- **A step file that statically imports a missing module stops cucumber before any scenario runs:** `ERR_MODULE_NOT_FOUND` on stderr, exit 1, and no message file at all. Scenarios that passed before do not run either. A dynamic import of a missing module fails only its step.
- **Scenarios are selected by location** (`features/x.feature:12`).
- **TypeScript steps need `NODE_OPTIONS="--import tsx"`.**
- **A regex step pattern inside a TypeScript string loses its backslashes unless they are doubled.** v1 agents slipped on this repeatedly, and a convention did not stop it. Prefer Cucumber expressions or regex literals.

### vitest 3

With `--reporter=json --outputFile=<file>`:

| Case | Where it appears | Message |
|:--|:--|:--|
| Test imports an export that does not exist | Test, `failureMessages` | `TypeError: (0 , generateCode) is not a function` |
| Test imports a module that does not exist | File, `message`, no tests listed | `Cannot find module '../../src/redirect' imported from '<test file>'` |
| Syntax error in a test file | File, `message`, no tests listed | `Transform failed with 1 error: …` |
| Failing expectation | Test, `failureMessages` | `AssertionError: expected 2 to be 4 // Object.is equality` |

- **A missing export does not fail the file load:** it arrives as `undefined`.
- **vitest does not type-check.** `tsc --noEmit` does.
- **Pass the test name as one argument: `--testNamePattern=<escaped name>`.** As two arguments, a name that starts with `-` is read as an option.
- **`passWithNoTests` in a project's config makes a run where nothing ran pass.** oid must check that the test it asked for ran.
- **`--exclude` on the command line is added to the configured excludes** (vitest 3.2 `cliExclude`). Use it to keep oid's own files out of a project's run.

### git

- **`git checkout -- .` does not remove untracked files.** A rollback needs `git reset --hard <checkpoint>` and `git clean -fd` on the writable paths.
- **Worktrees share the common git directory, and with it the project's hooks.** A checkpoint commit runs the project's `pre-commit` hook, which can refuse work in progress. Commit checkpoints with `-c core.hooksPath=/dev/null --no-verify`.
- **Worktrees do not share `node_modules`.** A symlinked `node_modules` is a file to git, so a `node_modules/` pattern (with the slash) does not ignore it. Add `/node_modules` to the file `git rev-parse --git-path info/exclude` names, without touching the project's `.gitignore`.
- **A test fixture's git inherits the global config and hooks** unless it is isolated.

### Node child processes

- **`spawnSync` blocks the event loop,** so time limits, `oid abort` and every timer stop working while the child hangs. Run checks with `spawn`, in their own process group, with SIGTERM then SIGKILL on a limit.
- **The exit of a killed child depends on the shell.** Whether `sh -c` execs a single command decides who receives the signal: v1 saw `137` on Ubuntu and `null` locally. Run `exec <command>` when the code depends on it.
- **A hung runner holds every lock taken around it.** A refusal about a lock names the holder's PID.
- **Time limits need slack for slow machines.** On a throttled CPU, a v1 baseline timed out and ended the run. A timeout is an `environment` failure, not a verdict on the code.
- **Wall time includes suspends.** In one v1 run a 77-minute laptop suspend was counted as run time, so measure active time.

### Paths and secrets

- **`os.homedir()` follows `$HOME`.** The account's real home is `os.userInfo().homedir`, which throws when the account has no passwd entry.
- **Resolve symlinks before checking for secrets,** and match secret-shaped names (`.env.alias`), not only exact ones.

## Edge cases to keep in mind

- **An agent can make a suite green without making the code work.** It can add `.only` or `.skip`, branch on a test environment (`process.env.VITEST`), or loosen a runner, type or lint config. That is why the gate's configuration is unwritable and those patterns in added lines are refused.
- **A refactor can make a test simpler and stop it from testing anything.** A changed test must still fail on a mutant of the current code.
- **A helper used once adds indirection.** A new exported symbol needs two references.
- **An agent writing a program as a string with `"\\n"`** gets a backslash and an `n`, not a line break. The script is invalid, records nothing, and the test looks like a valid Red that no code can pass. Write programs as template literals.
- **An unknown option that is silently ignored makes a check lie.** v1's `--mutant` was ignored for one release. Every command rejects unknown options.
- **oid working on its own repository must run from an installed build.** The code it changes must not be the code that runs it. This matters once oid is used on itself.

## Lessons for oid's own tests

- **Scenarios assert milestones, not where a run ends or what a message says word for word.** In v1, scenarios that asserted the end of a run broke each time a later FR extended the run, and scenarios that pinned prompt wording made every prompt change a full cycle.
- **A recorded runner reply must check the request it answers.** v1's replays answered by call order, and they still passed when the runner flag was mutated.
- **One real runner per kind of check; the rest can be recorded.**
- **Real runs find what tests do not.** v1's replay suite missed the symlinked `node_modules`, the project's hooks, the blocking `spawnSync` and the Pi abort, which the first real runs found.
