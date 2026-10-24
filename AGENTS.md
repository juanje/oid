# oid v2: instructions for the agents that build it

You build oid v2 in this repository, following Outside-In (Spec → BDD → TDD) by hand. oid itself is not run on this repository yet. You write feature files, step definitions, unit tests and code for the FRs in `SPEC.md`. You are not the product owner: the person owns the spec, the feature files and every decision in `DECISIONS.md`. You propose changes to them; you do not make them.

There are no process hooks. These rules work through their reasons, so each one carries its why.

All repository content is in English.

## Where to find things

Read on demand, when the trigger matches.

- `SPEC.md`: what to build and why, per FR, each marked **Skeleton** or **MVP**. Read it when you pick or work on an FR.
- `DOMAIN.md`: what the words mean, the Red classes, the formats, and how Pi, cucumber-js, vitest, git and Node behave. Read it before writing tests or code that touch any of them, and whenever two terms seem to mean the same thing.
- `docs/design.md`: how oid works now. Read it when an FR touches the loop, attempts, evidence, the gate, the refactor or state.
- `DECISIONS.md`: the decisions in force, and what each rules out. Read it before proposing a change of approach. If your change contradicts one, stop and ask.
- `~/git/outside-in-dev`: oid v1, the quarry (rule 7). Read it when an FR needs a piece v1 already had: `docs/design.md` §8 lists the candidates.

## How to build an FR

0. **Input.** Take the FR id from the person, or the next FR in `SPEC.md` within the current phase (Skeleton first).
1. **Feature file.** Write `features/<area>-<nn>.feature`, tagged with the FR, with few scenarios that assert observable milestones. **Stop and ask the person to approve it.** They may delegate the approval explicitly in chat for that FR. *Why:* the contract comes from outside the work (D-01).
2. **Step definitions, Red.** Write them with real assertions. Run the scenario, and show its failure: a valid Red (`DOMAIN.md`, Red classes), not an undefined step or a broken import.
3. **Unit test, Red.** Write the test for the next piece of logic. Run it and show it fails with a valid Red. Commit it on its own (`test(<FR>): …`). *Why:* the commit is the trace that the test existed and failed before its code.
4. **Code, Green.** Write the code that makes the test pass. Run the test, the current scenario, the FR's scenarios already green and the full unit suite. Commit (`feat(<FR>): …`).
5. **Repeat 3–4** until the scenario passes, then go back to 2 for the next scenario.
6. **Refactor**, once every scenario of the FR passes. Code first, with tests unchanged, then tests, with code unchanged. Commit each pass on its own (`refactor(<FR>): …`). *Why:* the half that stays fixed proves the other half did not change meaning (D-07).
7. **Gate.** Run the whole gate (below). Fix what fails before you say the FR is done.
8. **Record.** Add one line for the FR to `docs/build-log.md` (format below), then report to the person: what was built, the gate's result, anything shelved or open.

Where a Red is impossible (a guard, or behaviour an earlier scenario already built), prove the test with a mutant instead. Break the covered lines by hand, show the test failing, restore them, and say so in the commit message. Never stash, move or revert code to get a Red.

Checklist before reporting an FR done:
- [ ] The person approved the feature file, or delegated the approval.
- [ ] Each scenario and test was seen failing with a valid Red, or proved with a mutant.
- [ ] Tests and code are in separate commits.
- [ ] The whole gate passes.
- [ ] `docs/build-log.md` has the FR's line.

## Rules

1. **The spec and the approved feature files are the person's.** If a scenario cannot be built as written, or an FR seems wrong, stop and propose the change with its reason. *Why:* a wrong contract is built precisely, and only the person can say what they want.
2. **Run it before you claim it.** Every "it fails", "it passes" or "the gate is green" comes from a command you ran in this session, with its output. *Why:* the whole product rests on evidence, not claims, and so does building it.
3. **Stay inside the phase.** Build only FRs marked for the current phase (Skeleton first) and only what their scenarios ask for. Note anything else as a proposal; do not build it. *Why:* the skeleton is time-boxed to 4 days. Unrequested scope is how v1 grew past the point where it could be simplified.
4. **Pause at the checkpoints, even under "finish everything".** The feature review is a stop, each step is a commit, and the person's approval cannot be inferred. If a prompt says to finish without stopping, these checkpoints still win. *Why:* in v1, completion pressure made an agent skip the review, the Red and the per-step commits in one pass.
5. **Docs are rewritten in place, and stay within budget.**
   - `DECISIONS.md` gets an entry only for a decision that is expensive to reverse, and only after the person agrees.
   - `docs/design.md` stays around ten pages.
   - Never write "was X, now Y": git is the history.
   - Ask before creating a new document.

   *Why:* v1 reached 106k words of design docs and ADRs that contradicted each other, and 59 of 106 commits in one week were docs.
6. **Tests assert behaviour at the boundary.** Scenarios assert milestones the user can see, not where a run ends, internal names or message wording. Unit tests go where there is logic. A recorded runner reply must check the request it answers. *Why:* in v1, tests that pinned endings and wording broke on every later change.
7. **v1 is a quarry, not a template.**
   - Read `~/git/outside-in-dev` when an FR needs a piece it had.
   - Port the piece through the cycle, with new tests.
   - Never copy a test suite.
   - Never bring back what `docs/design.md` §8 leaves behind: the state machine, `cycle_step`, hooks, overrides, the shell floor.

   *Why:* each piece must earn its place in the new design. Wholesale copies carry v1's attractor with them.
8. **When something fails, fix the environment before adding a rule.** First fix the tool output, a boundary or a test helper. A new rule in a prompt or in this file is the last resort, and the person decides it. *Why:* in v1, every failure got a rule, and the rules piled up without stopping the failures.
9. **Check the code before stating what it does.** Read the code, its callers and its tests before saying what oid or a dependency does or does not do. For external tools, check `DOMAIN.md` and then the real behaviour on the pinned version. *Why:* confident claims from summaries were wrong several times in v1, once in a plan another agent then executed.
10. **Secrets stay unread.** Do not read `.env` files, keys or credentials, here or in v1. *Why:* nothing secret should reach a provider; oid's own design holds that as an invariant.

## Quality gate

Defined by the first Skeleton FR as `npm run gate`, which runs, in order:

```bash
npx tsc --noEmit
npx vitest run
NODE_OPTIONS="--import tsx" npx cucumber-js
```

Format, lint, coverage and traceability are added with the MVP FRs that bring them. A check that ran nothing fails. Until `package.json` exists, only docs can be committed.

## Commits and the build log

- **Commit types:** `test(<FR>)`, `feat(<FR>)`, `fix(<FR>)`, `refactor(<FR>)`, `docs`, `chore`. One logical change per commit.
- **Releases** wait for the pushed commit's CI to pass, once there is a remote and CI. *Why:* in v1, four releases were published with CI red.
- **`docs/build-log.md`** has one line per FR, and no more:

  ```
  | FR | date | interventions by kind | gate time | note (one sentence) |
  ```

  *Why:* the build must be comparable with the time an MVP of this size usually takes, and with oid's own runs later. v1's log was useful, but it grew to 270 long rows.
