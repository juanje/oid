# Design

How oid works now, and the principles it is built on. It is kept to about ten pages and rewritten in place when the design changes.
- **What** oid must do: `SPEC.md`.
- **Why** a choice was made over its alternatives: `DECISIONS.md` (cited as D-NN).
- **What the words mean:** `DOMAIN.md`.

## 1. Principles

oid is a system of agents, so it is designed the way a complex system is influenced, not the way a machine is controlled. The structure is simple and the rules are few. oid is strict only where the system cannot give way. Everywhere else it gives objective and direction, and lets useful behaviour emerge.

### The rules

This is the whole rulebook. Anything not here is influence (§1.3), not a check.

1. **The contract comes from outside the run** (D-01). The person approves the spec and the feature files; the run never changes them. *Why:* a wrong contract is built precisely.
2. **Red first** (D-02). Every new scenario and test is seen failing for the right reason on a broken version, then passing on the current code. *Why:* tests written before their code shape the design from the requirements, and are not fitted to the code.
3. **Done means the gate passes** (D-06). The checks are deterministic and tell the truth. *Why:* "am I done?" is answered by evidence, not by an agent.
4. **Every refusal says what failed, the evidence and the next step.** There are no dead ends; when nothing can move on, oid asks the person. *Why:* a bare "fail" brings blind retries and workarounds.
5. **Read everything except secrets and noise; write only your part** (D-05). *Why:* order and evidence keep tests honest, not blindness. Secrets never reach a provider, and the gate cannot be weakened by an agent that edits its configuration.
6. **Git is the undo.** oid works in its own worktree, and a rejected attempt goes back to the last checkpoint. *Why:* reverting costs nothing, and the person's copy is never at risk.

### Invariants and their legal exits

Held strictly:
- the contract (rule 1);
- the evidence (rules 2 and 3);
- the safety parts of rules 5 and 6: secrets, the gate's configuration and the person's copy.

Every other constraint has to justify itself and is measured. Every invariant has a legal exit; an invariant without one becomes a dead end.

| Invariant | Its legal exit |
|:--|:--|
| The contract | Shelve the scenario with a proposed diff; the person decides at the end |
| Red first | A mutant the agent proposes and oid applies |
| The gate | A refusal with its next step; the person when nothing can move on |

### Influence

| Parameter | In oid |
|:--|:--|
| **Objective** | The FR and the scenario, with their what and why, plus the goal of the whole system, in every task. |
| **Focus of attention** | What the task shows: the scenario, the failure, the relevant code and steps, conventions with their reasons. Above all, the text of every refusal. |
| **Boundaries** | Writable paths per attempt kind, no shell, limits on turns, cost, time and retries. Stated to the agent exactly as they are applied. |
| **Constraints** | The rules above, and the shape of the tools: few modes, opinionated defaults, structured results. |

The design leans on two mechanisms: refusals that point to the next step, and instructions that carry their reason.

## 2. The loop

```
INPUT: SPEC.md and approved feature files
  baseline gate
  → per FR, per scenario:
        STEPS (valid Red) → [ TEST (valid Red) → CODE (tests green) ]* → scenario green
  → REFACTOR: code pass, then test pass
  → GATE → COMMIT (squash of the FR's checkpoints)
  → shelved scenarios and their proposals, at the end of the run
```

- **Outer loop.** One scenario at a time, in file order. A steps attempt is accepted when the scenario fails with a valid Red.
- **Inner loop.** A test attempt is accepted when every new test fails with a valid Red against the previous checkpoint. A code attempt is accepted when those tests pass and nothing that was green turns red. That is checked on the current scenario, the feature's green scenarios and the full unit suite; the gate checks the whole project. How many tests, and how small, is guidance.
- **The next attempt** (D-03). By default the inner loop alternates test and code. An agent may ask in its report for another kind next (fix a step, another test, more code) with its reason. The evidence and the write boundary judge whatever comes.
- **Retries.** A refused attempt goes back to the last checkpoint and is retried with the refusal in its task, up to the limit: `limits.retries` in the project's `.oid.json`, 2 when the file does not set it. The limits of FR-RUN-09 cap what retries cost. An error (exit code 2) is never retried: no attempt can fix it. When the retries run out, oid asks the person: retry with a note, shelve the scenario, or stop.
- **Wiring.** When every unit test of a scenario is green and the scenario is still red, the next attempt is code that connects the parts. That is legal once the scenario has at least one unit test.

## 3. An attempt

An attempt is the unit of work (D-04):

| Part | What it is |
|:--|:--|
| Input | The agent's system prompt, the task, the write boundary, the tools (`read`, `edit`, `write`, `try`, `report`) |
| Process | One fresh agent in the run's worktree, with a turn limit. The executor is Pi, or the scripted executor in oid's own tests (prepared diffs and reports) |
| Output | The diff, and the report |
| Judgment | Write boundary on the diff; forbidden patterns in added lines; the evidence check of its kind |

**Write boundaries** (D-05):

| Kind | May write |
|:--|:--|
| steps | step definitions |
| test | unit tests |
| code | source |
| refactor-code | source |
| refactor-tests | unit tests and step definitions |

No kind writes feature files, `SPEC.md`, the gate's configuration or oid's state. The forbidden patterns in added lines are `.only`, `.skip`, and branches on a test environment.

**The report** ends every attempt. It holds a result in a few words, and may also hold:
- a request for the next kind;
- a contract-change proposal;
- a mutant.

An attempt without a report is refused.

**`try`** runs one test or one scenario, then the type check and the linter on the changed files. It answers in the shape of a refusal and records nothing. oid's judgment comes after it and does not trust it.

### Prompts

Each agent kind has its own system prompt, in two layers (D-09).
- **Identity:** what it is, does and is not, and a few traits as values with their why. Its limits are generated from the write boundary and tools, so the text and the enforcement cannot differ.
- **Procedure:** Step 0, numbered steps with the reason for any non-obvious order, the success criterion, negative constraints at their step, and a checklist.

The common facts come from one source: what oid is, the goal of the whole system and what oid checks.

The task gives:
- the FR's what and why;
- the scenario;
- the failure or refusal that led to this attempt, and the step definition the failure points to;
- the project's domain (`DOMAIN.md` or the spec's Domain section);
- the relevant code, tests and steps, chosen by relevance and within a budget;
- the conventions with their reasons.

## 4. Evidence

One judgment (D-02): a new test counts when it failed with a valid Red on a broken version and passes on the current code.

- **Classification.** The runner's report gives the class of the failure (`DOMAIN.md`, Red classes). oid first checks that the test it asked for exists and ran, and uses the compiler API to tell whether a symbol exists.
- **The broken version.** Normally it is the previous checkpoint's source, restored in a scratch copy, with the new tests on top. When that code already passes, it is a mutant: a diff the agent proposes in its report. oid applies it to covered lines, runs the test, and undoes it.
- **The record.** For each scenario and test, `progress.json` keeps the broken version (a checkpoint or a mutant diff), the class of the failure and the passing checkpoint.

## 5. The gate

One function, two entry points (D-06): the loop step before each commit, and `oid gate`.

| Check | Skeleton | MVP | On failure |
|:--|:--|:--|:--|
| Autofixes | — | In the run only | — |
| Format | — | Yes (a check, in `oid gate`) | Code agent |
| Lint, new errors only | — | Yes | The agent that owns the file |
| Types, new errors only | Yes | Yes | The agent that owns the file |
| Unit suite, whole | Yes | Yes | Code attempt with the failing test |
| Scenarios, all not shelved | Yes | Yes | Code attempt; a contract change shelves the FR |
| Coverage of the FR's new lines | — | Yes | Code agent: remove the lines, or ask for a test attempt |
| Traceability | — | Yes | Shown to the person |

The gate also runs at the start of a run as the baseline. A red test stops the run and asks; findings are recorded. A check that ran nothing, or got an unknown option, fails.

## 6. Refactor

At FR scale, after every scenario is green and before the gate (D-07).
1. The detectors run on the FR's whole diff: complexity, duplication, dead code, magic values and doc drift. Only findings new against the baseline count. With none, there is no agent.
2. **Code pass.** A cleanup agent may change source only.
3. **Test pass.** A cleanup agent may change tests and step definitions only, and each changed test must still fail on a mutant of the current code.
4. **Acceptance.** An item is accepted when everything still passes, its findings are gone, no new finding appears and no measure is worse. Each accepted item gets a checkpoint, and a rejected one goes back.

A change that needs both passes (a rename the tests import) takes three items: the code pass adds the new name and keeps the old one as an alias, the test pass moves the tests, and a last code item removes the alias.

## 7. State and record

- **Worktree and branch per run.** The worktree lives outside the repository, in `../.oid-worktrees/<repository>/<run id>`. Tools that skip paths containing `.git` must still see it, and the person's checkout must not hold it. Checkpoints are commits made without the project's hooks. The FR's commit is the squash of its checkpoints.
- **`progress.json`** (D-08), written only by oid and validated against its schema. It holds the status of each FR and, for each scenario and test, its evidence and whether it is shelved, with the proposal.
- **The run log.** Append-only. It holds attempts, verdicts, refusals, questions, and the measures of `SPEC.md` FR-STATE-02, computed by oid.
- **`oid status`** reads both: what is done with its evidence, what is shelved and why, and where the last run stopped.
- **Exit codes.** 0: the FR was built. 1: the run stopped on a refusal, which an attempt could act on. 2: an error no attempt can fix, such as an unknown option, a runner that does not know an option the project's configuration gives it, or an FR for which cucumber-js finds no scenario.

## 8. Reusable pieces in `~/git/outside-in-dev`

Port a piece only when an FR needs it, through the cycle and with new tests.

| Piece | Where |
|:--|:--|
| Runner verdict and Red classification | `src/artifacts/red-classification.ts` |
| Mutant | `src/artifacts/mutant.ts` |
| Secrets and containment | `src/agents/secrets.ts`, `src/agents/containment.ts` |
| Worktree, checkpoints, squash | `src/artifacts/git-workspace.ts`, `git-checkpoints.ts`, `git-squash.ts` |
| Pi integration | `src/agents/runner.ts`, `src/agents/sandbox.ts` |
| Typed refusal | `src/artifacts/rejection.ts` |
| SPEC and Gherkin parsing | `src/artifacts/spec.ts`, `src/artifacts/traceability.ts` |
| Detectors | `src/artifacts/complexity.ts`, `duplication.ts`, `dead-code.ts`, `magic-values.ts`, `doc-drift.ts` |
| Command supervisor | `src/artifacts/command-supervisor.ts` |

Do not reintroduce:
- the state machine;
- freezes;
- return machinery;
- `cycle_step`;
- hooks;
- overrides;
- the shell floor;
- scenarios that pin wording or endings;
- one unit test per Red as a check.

## 9. Not yet confirmed by runs

These parts of the design came from analysis, not from runs. The first runs confirm or change them:
- the agent choosing the next attempt kind (§2);
- no shell for any agent (§3);
- coverage of new lines as a gate check (§5);
- secret containment entering after the skeleton, which is safe only because the shortener holds no secrets;
- the order in which the rest of the MVP is built: the mutant, shelving, several FRs, the refactor and coverage first; then budget limits, `progress.json`, `oid status` and `oid gate`; `init`, `doctor`/`setup` and `resume`/`abort` last.
