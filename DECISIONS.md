# Decisions

The decisions in force, with their reasons and the options they rule out. Read this file before changing anything they cover.

**How this file is kept.** It holds only the current decisions, because v1's ADRs (numbered up to ADR-058) ended up contradicting and overriding each other.
- When a decision changes, its entry is rewritten in place. No entry supersedes another, and none says "was X, now Y": git keeps the history.
- An entry is added only for a decision that is expensive to reverse.
- Choices that are cheap to change live in the design (`docs/design.md`) or the code.
- Each entry is short: the decision, why, what it rules out, and what follows from it.

---

## D-01: The contract comes from outside the run

**Decision.** `SPEC.md` and the approved feature files are the input of `oid run`. They are written and approved before the run, by the person or by an agent the person drives. The run never changes them. When it finds a scenario it cannot build as written, it shelves the scenario with a proposed diff and goes on with the rest. The person decides at the end, and an applied change starts that scenario again from a Red.

**Why.** A wrong contract is built precisely, and only the one who wants the software can say what it is. Features as input mean the run needs no person between the contract and the commit.

**Rules out:**
- writing features inside the run;
- feature review as a step of the run;
- stopping the run for a question about the contract;
- agents editing feature files.

**Follows.** An FR with a shelved scenario is committed with what was accepted and stays in progress. The gate leaves shelved scenarios out and lists them.

## D-02: Red first is a gate, with one evidence judgment and the mutant as its exit

**Decision.** A new scenario or unit test counts only when oid has seen it fail with a valid Red on a broken version and pass on the current code.
- The broken version is the previous checkpoint's code.
- Where that code already passes, it is a mutant the agent proposes and oid applies, runs and undoes. That covers a guard, behaviour an earlier scenario built, and a test fixed after its code.
- The class of the failure is a recorded signal. oid refuses only a failure it can prove is not a Red; one it cannot read is accepted provisionally and confirmed by the code.

**Why.** Tests written before their code are the constraint that makes the design emerge from the requirements, and they keep tests from being fitted to the code. Without a legal exit, agents fake a Red: v1 saw stashed and moved code. With one judgment, the evidence means the same thing in every case. A judge that refuses what it cannot read makes agents shape the evidence to the judge, and grows a classifier per case.

**Rules out:**
- Red-first as a guided default only;
- separate return mechanisms per case (v1's returns, revise, reopen, rewrite_steps);
- a person accepting guards;
- refusing a failure for being unreadable.

**Follows.** A mutant changes only source files, must fail with `business_assertion` (a removed function only shows the test calls it), and is recorded as the evidence.

## D-03: No state machine: attempts with kinds, judged on their outcome

**Decision.** oid runs attempts. Each attempt has a kind (steps, test, code, refactor-code or refactor-tests), a write boundary checked on its diff, and an evidence check at its end. By default the inner loop alternates test and code. An agent may ask in its report for another kind next, with its reason. Any kind is legal at any time.

**Why.** v1's per-step state machine froze files and limited transitions. Every case it did not foresee became a dead end, and each dead end became an ADR: the cascade from ADR-035 to ADR-049. The order that matters is enforced by two things: the write boundary (tests and code never change in the same attempt) and the evidence.

**Rules out:**
- a `cycle_step` in `progress.json`;
- lists of legal transitions;
- freezes between attempts;
- hooks and overrides.

**Follows.** Going back is just another attempt. `progress.json` records evidence, not a position.

## D-04: Agents run on Pi, one process per attempt, behind an executor seam

**Decision.** Each attempt starts a fresh Pi agent in the run's worktree. Its inputs are a system prompt, a task, a write boundary and tools; it ends with a diff and a report. oid's judgment does not depend on which executor produced the diff. Claude Code, or another headless CLI, comes after the MVP as a second executor.

**Why.** Pi gives oid control of tools, reads and limits, which holds the secrets invariant, and the MVP stays smaller. A fresh process per attempt keeps context small. The seam turns another executor into an adapter, not a redesign. Many people would rather use their Claude Code subscription.

**Rules out:**
- long-lived agent sessions that advance the cycle;
- Claude Code in the MVP.

**Follows.**
- The model is personal: it lives in `<config dir>/config.json` (NFR-08), never in a project.
- In the MVP, oid runs Pi from its own agent dir, `<config dir>/agent`: its model registry, credentials, and rg and fd. It never reads `~/.pi/agent`, so using Pi by hand and using oid cannot affect each other. `oid setup` may copy credentials from Pi once, never link them.
- With an external executor, secrets rely on its deny rules plus an audit of the session's reads. That invariant is weaker in that mode, and the person must be told.

## D-05: No shell; read everything except secrets and noise; the gate's configuration is unwritable

**Decision.** Agents have read, ls, find, grep, edit and write tools, plus `try` and `report`; they have no shell. They read the whole repository except secrets and noise (`.git`, oid's state); ls, find and grep only read, under the same limits as read. No agent writes:
- feature files or `SPEC.md`;
- the gate's configuration: runner configs, `tsconfig`, lint and format configs, `package.json`, lockfiles;
- oid's state.

**Why.**
- **The shell.** In v1 it was the way around every write boundary: Bash writes showed up in 21 log rows. Containing it was expensive. `try` covers tests, types and lint.
- **Reading.** v1's ADR-058 showed that blindness to the repository was not what kept tests honest.
- **The gate's configuration.** An agent that can edit it can pass the gate by weakening it. v1 protected the runner configs, `tsconfig` and the lockfiles, but not the lint and format configs.

**Rules out:**
- a shell floor or command allowlist in the MVP;
- per-step read restrictions.

**Follows.** If runs show agents stuck without a shell (throwaway scripts, inspecting dependencies), the shell is opened on that evidence, not before.

## D-06: The gate is one function with two entry points

**Decision.** The loop runs the gate itself before each FR's commit, outside any agent. `oid gate` runs the same function for the person and CI, and writes nothing. Agents do not call the gate. When it fails, its refusal is their feedback, and `try` is their tool for checking one test. The gate covers:
- types;
- the full unit suite;
- every scenario not shelved;
- format, lint, coverage of the new lines and traceability, which come in the MVP.

Lint and types count only errors that are new against the baseline.

**Why.** "Done" is answered by evidence, not by an agent. One function means the run and CI cannot disagree. Coverage of new lines is the check against over-engineering, the article's third failure.

**Rules out:**
- an agent `gate` tool;
- `oid verify` in the MVP (reviewed after it);
- `oid gate` applying autofixes.

## D-07: Refactor at FR scale, on findings, code first

**Decision.** Once every scenario of an FR is green, two detectors run on the FR's diff against the whole source: duplication, compared after normalising identifiers and literals so that adapted copies count, and complexity above the project's limit. A finding starts a cleanup agent with its own prompt, which changes source only, with tests and steps fixed. Each accepted item gets its own checkpoint. With no finding there is no agent. A second pass over tests and steps, with the code fixed and each changed test still failing on a mutant, comes after the MVP.

**Why.** v1 showed that a refactor after each Green finds too little and costs too many cycles. A code agent sent back to fix findings tends to re-implement what works. oid builds the minimum each scenario asks for, with no named helpers, so the next change tends to copy what it needs; acting when a change creates the copy shapes the helper by a real need. The tests, fixed during the code pass, prove the behaviour did not change.

**Rules out:**
- refactoring after each Green;
- refactor findings sent back to the code agent;
- a cleanup agent with no finding;
- refactoring existing debt inside an FR (that is `oid tidy`, after the MVP).

## D-08: State is evidence and a log; the person reads it with `oid status`

**Decision.** Only oid writes state:
- `progress.json`, validated against its schema, holds each FR's status and, for each scenario and test, its evidence and whether it is shelved;
- an append-only run log holds attempts, verdicts, refusals, questions and the measures, all computed by oid.

The person reads both with `oid status`. There is no `oid progress`.

**Why.** v1's `progress step`, `revise` and `reopen` were moves for an orchestrator outside oid, and v2 has none. Measures an agent computes are plausible and wrong. The log keeps the tracking `oid verify` gave in v1: where a run stopped and what the agent was doing.

**Rules out:**
- agents or people editing `progress.json`;
- narrative fields in it.

## D-09: Prompts are environment, in two layers per agent

**Decision.** Each kind of agent has its own system prompt, in two layers.
- **Identity:** what it is, does and is not; a few traits as values with their why; limits generated from its boundary.
- **Procedure:** Step 0, numbered steps with the reason for any non-obvious order, the success criterion, negative constraints at their step, and a checklist.

Only the common facts come from one source: what oid is, the goal of the whole system and what oid checks. Tests check the mechanism around prompts, not their wording. Runs judge the wording.

**Why.**
- Each agent has its own objective, focus and limits.
- Values carry to cases no rule foresees.
- A rule without its reason is followed less. v1's denials went from 98 to 6 when instructions got their why.
- In v1, tests pinned prompt wording, so every prompt change cost a full cycle.

**Rules out:**
- a shared identity;
- long lists of "never" clauses;
- adding a prompt rule as the first answer to a failed run. Fix the tool output or a boundary first.

## D-10: How v2 is built

**Decision.**
- **Where:** a new repository. v1 is used as a quarry from its own checkout, and a piece enters only when the design asks for it, with new behaviour-level tests.
- **How:** built with Claude Code and a short `AGENTS.md`, with no process hooks. oid is not used on itself until the MVP runs on an external target.
- **The walking skeleton comes first:** the URL shortener as a library, time-boxed to 4 days; it ran in one. The rest of the MVP has no time box (Juanje, 2026-10-25). Instead, if development slows down the way v1's did, the work stops and the cause is analysed before going on.
- **The MVP is done when:**
  - every shortener FR has been built by `oid run` in at least three runs;
  - then one FR of an existing project has been built;
  - each FR had at most one intervention that is not about the contract.
- **How runs change the system:** one change per run, the noise measured before an effect is attributed, and a separate evaluator for the analysis.

**Why.** In v1, self-hosting, hooks and one ADR per decision built an attractor. Every change took full cycles, 59 of 106 commits in a week were docs, and the design could not be simplified from inside. With "read everything", v1's 106k words of design docs in the same repository would pull agents back to it.

**Rules out:**
- a branch of `outside-in-dev`;
- importing v1's test suites wholesale;
- self-hosting while the core is built.
