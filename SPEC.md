# oid v2 — Specification

**Status:** first draft, 2026-10-24. The FRs that rest on parts of the design not yet confirmed by runs are listed at the end.

`oid` (Outside-In Development) is a command-line tool that has coding agents build software from a verifiable contract. The person approves the requirements and the acceptance scenarios. oid runs agents that write step definitions, unit tests and code, and accepts their work only on evidence: a test counts when oid has seen it fail without the code and pass with it, and an FR is done when the gate passes.

Vocabulary, formats and tool behaviour: `DOMAIN.md`. Decisions in force: `DECISIONS.md`. How it works: `docs/design.md`.

Methodology reference: [Outside-In Development](https://ai.juanjeojeda.com/outside-in-development). The article gives the direction; oid tests it in practice and applies the refined version. A difference between the two is a finding, not a defect by itself.

## Goal

The person writes `SPEC.md` and the feature files, approves them, and runs `oid run`. They get back a branch with one commit per FR. In it, every behaviour is traced to a scenario and every scenario to an FR, and every test was seen failing for the right reason before its code existed. At any moment the person can see what is built, whether it works, and what is left.

## MVP

The walking skeleton comes first. It is the smallest loop end to end, on one FR of the target: steps → unit test → code → gate → commit.

The rest of the MVP adds what the target and the first runs ask for:
- several FRs in one run;
- the mutant as Red's legal exit;
- shelving a scenario with a contract-change proposal;
- the FR refactor;
- coverage and traceability in the gate;
- budget limits;
- `progress.json`;
- the `status`, `gate`, `init`, `doctor`/`setup`, `resume` and `abort` commands;
- a minimal help and the version (FR-CLI-04);
- a `README.md`: what oid is, how to install it and run it, the commands it supports, and a pointer to `oid --help` for their options instead of a copy of them. It is rewritten in place when the commands change.

Each FR below says which of the two it belongs to.

**Skeleton build order.** FR-RUN-01 comes first, as the thinnest end-to-end slice: `oid run` on a tiny fixture project, with the scripted executor (FR-AGENT-01), ending in one commit. Its scenarios drive minimal versions of the worktree, the evidence check and the gate. Each FR after it deepens one piece:
1. FR-RUN-01
2. FR-RUN-02, FR-RUN-03: the outer and inner loops
3. FR-EVID-01, FR-EVID-02: classification and evidence
4. FR-AGENT-04, FR-AGENT-06, FR-AGENT-07: write boundaries, `try`, `report`
5. FR-GATE-01, FR-GATE-04: the gate and its refusals
6. FR-RUN-07, FR-RUN-09: retries and the turn limit
7. FR-STATE-01, FR-STATE-02, FR-CLI-01: checkpoints, the run log, the end-of-run summary
8. FR-AGENT-01, FR-AGENT-02, FR-AGENT-03, FR-AGENT-05: the real Pi executor, its prompts, its context, no shell
9. Before the first real run: `bin/oid` (FR-RUN-01) and the `model` key of `.oid.json` (FR-AGENT-01)

The skeleton is done when `oid run` builds FR-SHORTEN-01 of the shortener with the real Pi executor.

**Target for the MVP:** a URL shortener as a TypeScript library with an in-memory store. Its FRs are shorten, resolve, reject invalid URLs, idempotency, and collisions with an injected code generator. Its behaviour is pure code, with no server, network or database, so that the runs test the loop and not the environment. Its own `SPEC.md` and feature files are written and approved separately.

**The MVP is done when:**
- `oid run` has built every FR of the shortener in at least three runs;
- then it has built one FR of an existing project;
- each FR had at most one intervention that is not about the contract.

## Not in scope

- Writing requirements or feature files. The design phase (`oid spec`) and writing features inside a run come after the MVP.
- Commands for other agents or harnesses to drive the cycle: `oid verify`, hooks, adapters (gate mode). They are reviewed after the MVP.
- Other agents as executors (Claude Code or another headless CLI). They come after the MVP, through the executor seam (FR-AGENT-01).
- The decision model (a "System One" classifier for micro-decisions).
- Refactoring existing debt outside the FR being built (`oid tidy`).
- A richer terminal interface than plain output and questions.
- Python, or test runners other than vitest and cucumber-js.
- Merging into the main branch. oid delivers a branch; merging is the person's decision.

## Stack and tools

- **oid itself:** TypeScript on Node.js ≥ 22.19. Agents run on the Pi SDK 1.4.0 (`@earendil-works/pi-coding-agent`, `pi-ai`, `pi-agent-core`), pinned to that exact version. Move to a newer 1.x only on purpose, and re-check the Pi behaviour in `DOMAIN.md` when you do. Tests use vitest 3 (unit) and cucumber-js 13 (BDD), pinned to exact versions; types are checked with `tsc --noEmit`. Stay on vitest 3: oid parses its JSON report, and `DOMAIN.md` describes vitest 3.
- **Target projects:** TypeScript with vitest 3 and cucumber-js 13. Detectors are bundled with oid; the candidates are `knip`, `jscpd` and analyses on the TypeScript compiler API.

## Functional requirements

### Run

#### FR-RUN-01: Run one FR on approved features
**Skeleton.** `oid run <FR>`, the command oid's package installs as `bin/oid`, builds one FR whose feature files are approved and in the repository. It works in its own git worktree, branched from the current `HEAD`, and ends with one commit of that FR on the run's branch. The person's working copy is never touched. *Why:* the contract comes from outside the run, and a run that can damage the working copy cannot be trusted to run alone.

#### FR-RUN-02: One scenario at a time, Red first
**Skeleton.** For each scenario of the FR, in file order, a steps attempt writes its step definitions. The attempt is accepted only when the scenario fails with a valid Red (FR-EVID-01). Then the inner loop runs until the scenario passes, and the run moves to the next scenario. *Why:* the outer loop is what turns the contract into a design; a scenario that passed before its code would prove nothing.

#### FR-RUN-03: The inner loop
**Skeleton.** While the scenario fails, a test attempt writes one or more unit tests. It is accepted only when every new test fails with a valid Red against the previous checkpoint. A code attempt then writes code until those tests pass. After each code attempt oid runs the current scenario, the scenarios of the feature already green, and the full unit suite; a test or scenario that was green and turns red rejects the attempt. The whole project is checked at the gate. How many tests and how small they are is guidance in the prompts, not a check. *Why:* tests written before their code shape the design; the size of each step is the agent's judgment.

#### FR-RUN-04: The agent may ask for another kind of attempt
**MVP.** By default the inner loop alternates test and code. An agent may end its attempt asking for another kind next, with its reason: a step that asserts the wrong thing, another test, more code. oid accepts any kind at any time, and the evidence and the write boundary of that kind judge the result. *Why:* a fixed sequence turns every case it does not foresee into a dead end. The agent sees the work; the evidence keeps it honest.

#### FR-RUN-05: Several FRs in one run
**MVP.** `oid run <FR…>` builds the FRs in the order given, one commit each, on the same branch. *Why:* real work is several FRs; one run per FR multiplies setup and review.

#### FR-RUN-06: Shelve a scenario the run cannot build as written
**MVP.** An agent that finds a scenario wrong, ambiguous or in contradiction with another ends its attempt with a proposed diff of the feature file and its reason. oid shelves the scenario and goes on with the rest of the FR. At the end of the run it shows each proposal. The FR is committed with what was accepted, and stays in progress until a later run builds the shelved scenario. The person applies or rejects the proposal; an applied change is a new approved contract, and the next run proves that scenario again from a Red. *Why:* the run must never change the contract, and it must not stop for a question the person can answer at the end.

#### FR-RUN-07: Retries
**Skeleton.** A rejected attempt goes back to the last checkpoint and is retried with the refusal, up to a configured number of retries. In the skeleton the run then stops and prints the last refusal. **MVP:** it asks the person instead (FR-RUN-08). *Why:* a refusal that points somewhere usually fixes the next attempt; a limit keeps a stuck attempt from burning the budget.

#### FR-RUN-08: Ask the person when no step can move on
**MVP.** When retries run out, or when no refusal has a next step, oid asks the person in the terminal. It shows what failed, the evidence and the options: retry with a note, shelve the scenario, or stop the run. *Why:* there are no dead ends; the person is the last legal exit.

#### FR-RUN-09: Limits
**Skeleton:** a maximum number of turns per attempt. **MVP:** limits on cost, time and retries per run, from the config. Reaching a limit ends the run cleanly at the last checkpoint and says which limit. *Why:* a run must end even when nothing else stops it, and the person must know what it cost.

#### FR-RUN-10: Baseline at the start of a run
**MVP.** Before the first attempt, oid runs the gate on the starting tree. A failing unit test or scenario stops the run and asks the person. Lint, type and detector findings are recorded as the baseline. *Why:* an FR must not be blamed for, or blocked by, what was already there.

#### FR-RUN-11: Resume and abort
**MVP.** `oid abort` stops a running run after its current attempt. `oid resume` continues a stopped run from its last checkpoint; an interrupted attempt is discarded, not half-applied. *Why:* runs are long, and the person must be able to stop one without losing what was accepted.

### Evidence

#### FR-EVID-01: Classify a failure
**Skeleton.** oid classifies the failure of a test or scenario from the runner's report. It is a valid Red, an invalid Red, or a case it cannot decide. A case it cannot decide is a refusal in the skeleton and a question to the person in the MVP. Before reading any output, oid checks that the test it asked for exists and ran. *Why:* an import error or an undefined step looks like a Red and proves nothing; a test that never ran must never count.

#### FR-EVID-02: Judge the evidence of a new test
**Skeleton.** A new test or scenario counts when oid has seen it fail with a valid Red on a broken version and pass on the current code. In the ordinary case, the broken version is the code at the previous checkpoint. *Why:* this one judgment is what "Red first" stands for, whoever wrote the test and in whatever order.

#### FR-EVID-03: A mutant where a Red is impossible
**MVP.** Sometimes the previous checkpoint's code already passes a new test: a guard, behaviour an earlier scenario built, or a test fixed after its code. The agent then proposes a mutant in its report. oid applies it, runs the test, and undoes it. The mutant must touch lines the test covers, and the failure must be a valid Red. The mutant's diff is recorded as the evidence. *Why:* without a legal exit, agents fake a Red; with one, the evidence still means "this test tells correct code from broken code".

#### FR-EVID-04: Record the evidence
**MVP.** For each scenario and test, oid records in `progress.json` the broken version it failed on (a checkpoint or a mutant), the failure class, and the checkpoint it passed on. *Why:* the person and later runs must be able to see why a test counts, and the refactor's test pass needs it (FR-REF-03).

### Agents

#### FR-AGENT-01: One attempt, one agent process
**Skeleton.** Each attempt starts a fresh Pi agent in the run's worktree with four inputs: its system prompt, the task, its write boundary, and its tools. It ends with a diff and a report. oid judges the result the same way whichever agent produced it. The agent never advances the run. Two executors sit behind that seam: Pi, and a scripted executor that returns prepared diffs and reports. oid's own scenarios use the scripted one. Pi runs the model that the `model` key of the project's `.oid.json` names, as `<provider>/<model>`, resolved through Pi's own registry and credentials, which oid never reads. **MVP:** oid is fully isolated from the person's Pi configuration, so that using Pi as a coding assistant and using oid cannot affect each other. oid has its own agent dir for Pi, with its model registry, its credentials, and the rg and fd binaries Pi looks for there; it never reads `~/.pi/agent`. In the skeleton, Pi's own store may still be used. *Why:* a fresh agent per attempt keeps context small, and a tool the person also uses by hand must not change oid's runs, nor oid theirs. A judgment that ignores who wrote the diff lets another executor come in later as an adapter.

#### FR-AGENT-02: A prompt per agent, in two layers
**Skeleton.** Each kind of agent has its own system prompt, in two layers (D-09). The first is its identity: what it is, does and is not, with a few traits stated as values with their why. Its limits are generated from its write boundary and tools, so the text and the enforcement cannot differ. The second is its procedure: Step 0 (the input), numbered steps with the reason for any non-obvious order, the success criterion in plain words, negative constraints at the step they apply to, and a short checklist. The task holds only the inputs of one attempt (FR-AGENT-03). Facts every agent needs (what oid is, the goal of the whole system, what oid checks) come from one source. *Why:* each agent has its own objective, focus and limits; values carry to cases a rule does not foresee.

#### FR-AGENT-03: What each agent sees
**Skeleton.** The task gives the FR's what and why, the scenario with its steps, and the failure or refusal that led to this attempt, with the step definition the failure points to; after the gate, its focus: the broken scenarios, of whichever FR, with their steps and failures. It also gives:
- the relevant code, chosen by imports: the step definitions the scenario uses, the source modules they import, and the unit tests that import those modules, within 40,000 characters, naming what was cut;
- to a steps attempt, the patterns of the step definitions the project already has, so that it reuses them instead of writing duplicates that cucumber-js reports as ambiguous;
- the project's domain: `DOMAIN.md`, the Domain section of `SPEC.md`, or the file `paths.domain` names in `.oid.json`; optional;
- the project's conventions with their reasons: `CONVENTIONS.md`, the Conventions section of `SPEC.md`, or the file `paths.conventions` names; optional.

Never the project's `AGENTS.md` or `CLAUDE.md`: they hold process instructions for other agents, which would contradict oid's procedure. *Why:* focus of attention decides which part of the solution space the agent explores; the refusal is the most useful part of it.

#### FR-AGENT-04: Write boundaries, checked on the diff
**Skeleton.** Each attempt kind may write only its own paths:
- steps: step definitions;
- test: unit tests;
- code: source;
- refactor-code: source;
- refactor-tests: tests and step definitions.

No agent writes feature files, `SPEC.md`, the gate's configuration or oid's state. The gate's configuration is the runner configs, `tsconfig`, the lint and format configs, `package.json` and the lockfiles. A diff outside the boundary rejects the attempt, and the refusal names the files. So do these patterns in added lines: `.only`, `.skip`, and branches on a test environment such as `process.env.VITEST`. *Why:* the order and the evidence keep tests honest only if tests and code change in separate attempts. An agent that can edit the gate can pass it by weakening it.

#### FR-AGENT-05: No shell; read everything except secrets and noise
**Skeleton.** Agents have read, ls, find, grep, edit and write tools, plus `try` and `report`, and no shell. They may read the whole repository except secrets and noise; noise is `.git` and oid's own state. ls, find and grep only read, under the same limits as read. Every file tool (read, write, edit, ls, find, grep) refuses a path that resolves outside the run's worktree, with symlinks resolved, and a secret-shaped name inside it, before the call runs; the refusal names the path and why. Pi's tools accept absolute paths and `~`, so without this an agent could read the person's credentials or write to their copy, and the diff check would not see it. *Why:* a shell is a way around every write boundary, and containing it is expensive. What keeps tests honest is the order and the evidence, not blindness to the rest of the repository.

#### FR-AGENT-06: The `try` tool
**Skeleton.** `try` runs one test or one scenario, then the type check and the linter on the files the attempt changed. It answers with a structured result, and a failure has the same shape as a refusal. It records nothing. *Why:* agents need a fast way to check their work; oid's own judgment comes after, and does not trust it.

#### FR-AGENT-07: The `report` tool
**Skeleton:** an attempt ends with `report`, giving its result in a few words. **MVP:** `report` can also ask for another attempt kind (FR-RUN-04), propose a contract change (FR-RUN-06), or submit a mutant (FR-EVID-03). An attempt that ends without `report` is rejected. *Why:* a structured ending is what lets oid act on the agent's view without parsing free text.

### Gate

#### FR-GATE-01: The gate
**Skeleton:** types, the full unit suite and every scenario of every feature, over the whole project. **MVP:** it adds the project's autofixes first, then format, lint, coverage (FR-GATE-02) and traceability (FR-GATE-03). Lint and types count only errors that are new against the baseline. Each check is PASS or FAIL. A run where no test ran fails, and an unknown option is an error. Shelved scenarios are left out of the run and listed in its output. It runs at the start of a run (FR-RUN-10) and before each FR's commit. *Why:* done means the gate passes; that question is answered by evidence, not by an agent.

#### FR-GATE-02: Coverage of the new lines
**MVP.** Lines the FR added that no test covers fail the gate. The refusal goes to the code agent: it removes them, or asks for a test attempt. *Why:* it is the check against over-engineering, the article's third failure. Code without a test is behaviour without a scenario.

#### FR-GATE-03: Traceability
**MVP.** Every scenario carries an FR tag found in `SPEC.md`. Every FR in the run has at least one scenario. A tag with no FR, or an FR with no scenario, fails the gate. *Why:* every behaviour traces to a scenario and every scenario to a requirement, or the spec and the product drift.

#### FR-GATE-04: A failing gate is a refusal
**Skeleton:** a failing test or scenario goes back to a code attempt, with the failure as evidence. A type error goes back to the attempt kind that owns its file (source to a code attempt, unit tests to a test attempt, step definitions to a steps attempt), with the error as evidence; a file no kind owns goes to a code attempt, since nobody can write it and the cause is almost always in the source. When errors are in files of several owners, one attempt goes back at a time, outside-in. A test or steps attempt the gate sends back is judged by its boundary, its report and the gate run again, with no new Red, and the number of tests must not drop. Each attempt the gate sends back counts as a retry; when the retries run out, the gate's failure is a refusal. **MVP:** a new lint error goes to the agent that owns the file. If a regression can only be fixed by changing another FR's scenario or test, that is a contract change, and the FR is shelved with a proposed diff (FR-RUN-06). *Why:* no dead ends; the gate's output is the next attempt's focus.

#### FR-GATE-05: `oid gate`
**MVP.** `oid gate` runs the same gate on the working copy and writes nothing: format runs as a check, not as an autofix. It prints one PASS/FAIL line per check and exits 0 only when every check passes. *Why:* the person can confirm that everything really passed, and CI can run it. One function behind both entry points means they cannot disagree.

### Refactor

#### FR-REF-01: Detect findings on the FR's diff
**MVP.** Once every scenario of the FR is green, oid runs its detectors on the FR's whole diff: complexity, duplication (across files too), dead code, magic values and doc drift. Only findings that are new against the baseline count. With none, the refactor ends without starting an agent. *Why:* "refactor if needed" never happens without a signal, a scope and a stopping condition. At FR scale there is enough change to find refactors worth doing.

#### FR-REF-02: The code pass
**MVP.** A cleanup agent receives the findings and may change source only. Its job is to clean without changing behaviour. An item is accepted when every test and scenario still passes, its findings are gone, no new finding appears and no measure is worse. Each accepted item gets its own checkpoint; a rejected item goes back to the last one and is reported. *Why:* the unchanged tests prove the behaviour did not change. A cleanup agent with its own prompt does not re-implement what works.

#### FR-REF-03: The test pass
**MVP.** After the code pass, a cleanup agent may change tests and step definitions only, under the same acceptance rules. Each changed test must also still fail on a targeted mutant of the current code. A change that needs both (renaming a function the tests import) takes three items: the code pass adds the new name with the old one as an alias, the test pass moves the tests, and a last code item removes the alias. *Why:* the unchanged code proves the tests still pass, and the mutant proves a cleaner test is not a weaker one.

### State and record

#### FR-STATE-01: Worktree and checkpoints
**Skeleton.** A run works in its own worktree and branch. It checkpoints each accepted attempt, and a rejected attempt goes back to the last checkpoint. The FR's commit is the squash of its checkpoints. When the run ends, its worktree is removed and its branch kept. *Why:* git is the undo; reverting costs nothing.

#### FR-STATE-02: The run log and its measures
**Skeleton.** Each run writes an append-only log of its attempts, verdicts, refusals and questions, and the measures below, all computed by oid and never by an agent:
- **interventions** by kind: contract, stuck, other;
- **attempts and rejections** per attempt kind;
- **blind retries:** a retry that fails with the same failure and evidence as the one before it;
- **denied tool calls;**
- **cost, tokens and time;**
- **the model** of each agent;
- **the instruction count** of each prompt.

The log starts by naming the version of oid that made it, so that runs can be compared by version. Next to the log, a directory keeps each attempt's transcript, its agent's whole session, one JSONL file per attempt; the end-of-run summary names it.

*Why:* the runs are the evidence for changing prompts, rules and the theory. Measures an agent computes or estimates are plausible and wrong. A verdict without the session that led to it cannot be explained.

#### FR-STATE-03: `progress.json`
**MVP.** oid writes `progress.json`, validated against its schema, and no agent writes it. For each FR it holds the status. For each scenario and test it holds the evidence (FR-EVID-04) and whether it is shelved, with the proposal. It holds no position in a cycle. *Why:* the person and the next run must know where things stand without guessing. A schema keeps the file a record, not a narrative.

### Commands

#### FR-CLI-01: `oid status`
**Skeleton:** the run prints a summary at its end. **MVP:** `oid status` shows the same at any time, read-only:
- which FRs and scenarios are done, with their evidence;
- which are shelved, and why;
- where the last run stopped.

*Why:* the person always knows what is built, whether it works and what is left.

#### FR-CLI-02: `oid init`
**MVP.** `oid init` writes the project's config: runner commands, paths (spec, feature files, steps, tests, source, and an optional domain file), limits. It detects what it can and asks for the rest. In the skeleton the config is written by hand. *Why:* a new project should not need to know the config format to start.

#### FR-CLI-03: `oid doctor` and `oid setup`
**MVP.** `oid setup` configures the person's provider, credentials and the model per agent, in oid's own agent dir for Pi (FR-AGENT-01), and installs rg and fd there. It may offer to copy credentials from Pi once, as a copy and never a link. `oid doctor` checks, without changing anything, the project's runners, oid's agent dir with rg and fd, a credential per provider and each agent's model. *Why:* most failed first runs are environment problems, and they should be found before a run spends money.

#### FR-CLI-04: Help and version
**MVP.** `oid` with no arguments, `oid --help` and `oid help` list the commands and how to use each. `oid <command> --help` gives that command's usage and runs nothing. `oid --version` prints oid's version. The help is generated from the same command table the argument parser uses, so the two cannot disagree. An unknown command or option is still an error (NFR-02). *Why:* the person learns oid from oid itself, and a help written apart from the parser drifts from it.

## Non-functional requirements

### NFR-01: Every refusal says what failed, the evidence and the next step
Every refusal has three parts, and none may be empty: from the gate, the evidence check, a write boundary, `try`, or a denied tool call. Retrying is never the only next step offered. *Why:* a bare "fail" brings blind retries and workarounds; a refusal that points somewhere focuses the next attempt.

### NFR-02: Every check tells the truth
A check that did not run, ran no test, or got an option it does not know is a failure or an error, never a pass. Output is read only after checking that the thing asked for exists and ran. *Why:* the whole system rests on evidence; one check that can pass by accident breaks it.

### NFR-03: One judgment, one place
Each judgment is one function, used by every entry point that needs it: Red classification, evidence, the gate, write boundaries. *Why:* a judgment written twice drifts apart.

### NFR-04: Boundaries are stated as they are applied
What an agent is told it may read, write and call is generated from the same data that enforces it. *Why:* a limit the agent does not know about costs a turn; a limit it is told about but that is not enforced is advice.

### NFR-05: Prompts are environment, judged by runs
Tests check the mechanism around prompts, not their wording: that each agent's limits are generated from its boundary, that the conventions arrive, and that the common facts come from one source. A prompt change is a change to the environment, measured by runs. *Why:* tests that pin wording make every prompt change cost a full cycle.

### NFR-06: The person's copy and secrets are safe
A run never writes outside its worktree, and `oid gate` writes nothing. Nothing secret reaches a provider (FR-AGENT-05). *Why:* these are invariants; one breach is enough to stop trusting the tool.

### NFR-07: The command line loads lazily
`oid`, `oid --help`, `oid help`, `oid <command> --help`, `oid --version` and an unknown command load only the argument parser and the help. Pi, the TypeScript compiler API and the run's modules load only when a command needs them. Tests check which modules load, not how long it takes. *Why:* the help and the version should answer at once; loading Pi for them took about half a second and 1,557 modules.

## Draft notes

- **FRs that rest on parts of the design not yet confirmed by runs** (`docs/design.md` §9):
  - FR-RUN-04: choosing the next attempt;
  - FR-AGENT-05: no shell, and secret containment after the skeleton;
  - FR-GATE-02: coverage;
  - FR-GATE-05: format as a check only in `oid gate`;
  - the order in which the rest of the MVP is built.
- **Choices for the person to confirm:**
  - scenarios run in file order (FR-RUN-02);
  - an FR with a shelved scenario is committed with what was accepted and stays in progress, and the gate leaves shelved scenarios out (FR-RUN-06, FR-GATE-01);
  - the FR's commit is the squash of its checkpoints (FR-STATE-01).
- **Measures** (FR-STATE-02). The definitions are a first version; they are fixed before the first run.
- **Not yet decided here:** the config format, the shape of the run log, and the exact `report` schema. They belong to the design document, not the spec.
