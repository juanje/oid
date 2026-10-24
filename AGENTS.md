# oid

You build oid by Outside-In, by hand. That means you write the feature files, step definitions, unit tests and code for the FRs in `SPEC.md`.

You are not the product owner. `SPEC.md`, the approved feature files and `DECISIONS.md` belong to the person: you propose changes to them, never make them. Do not run oid on this repository.

Write everything in the repository in English.

## Where to find things

Read a file when its trigger matches, not before.

- `SPEC.md`: FRs with what and why, each marked Skeleton or MVP. Read it when you pick or work on an FR.
- `DOMAIN.md`: terms, Red classes, formats, and how Pi, cucumber-js, vitest, git and Node behave. Read it before you write tests or code that use any of them, and when two terms seem to mean the same thing.
- `docs/design.md`: how oid works. Read it when an FR touches the loop, attempts, evidence, the gate, the refactor or state.
- `DECISIONS.md`: the decisions in force and what each rules out. Read it before you change an approach. If your change contradicts a decision, stop and ask.
- `~/git/outside-in-dev`: an earlier implementation, read-only. Read it only when an FR needs a piece listed in `docs/design.md` §8.

## Procedure: build one FR

0. **Input.** Take the FR id the person gives. With none, take the next FR in the skeleton build order (`SPEC.md`, MVP) that has no line in `docs/build-log.md`.
1. **Feature file.** Write `features/<area>-<nn>.feature`, with `@<FR>` on `Feature`. Keep scenarios few, each asserting an outcome the user sees. **Stop and ask the person to approve it.** Go on only after approval, or after the person delegates the approval in chat for this FR. Then commit the feature file alone: `spec(<FR>): …`. The committed file is the contract that the Reds are checked against.
2. **Steps, Red.** Write the step definitions with real assertions, then run the scenario. Go on only on a valid Red (`DOMAIN.md`, Red classes). An undefined step or a load error is not one.
3. **Unit test, Red.** Write the test for the next piece of logic and run it. Go on only on a valid Red. Commit the test alone: `test(<FR>): …`. The commit is the proof that the test failed before its code existed.
4. **Code, Green.** Write the code, then run the test, the current scenario, the FR's scenarios already green and the full unit suite. All must pass. Commit: `feat(<FR>): …`.
5. **Repeat 3–4** until the scenario passes, then do step 2 for the next scenario.
6. **Refactor**, when every scenario passes, in two passes:
   1. change source with the tests unchanged, and commit;
   2. change tests with the source unchanged, and commit.

   Use `refactor(<FR>): …` for both. Each unchanged half proves the other kept its meaning.
7. **Gate.** Run `npm run gate`. Fix every failure before step 8.
8. **Record.** Append the FR's line to `docs/build-log.md`. Then report to the person: what was built, the gate's result, and what is open.

**When no Red is possible** (a guard, or behaviour an earlier scenario built), use a mutant:
1. break the lines the test covers;
2. run the test and show it fails;
3. restore the lines;
4. name the mutant in the commit message.

Never stash, move or revert code to get a Red.

Before reporting an FR:
- [ ] Feature file approved (or approval delegated) and committed as `spec(<FR>)`
- [ ] Every scenario and test seen failing with a valid Red, or proved by a mutant
- [ ] Each test committed before its code
- [ ] `npm run gate` passes
- [ ] Build-log line added

## Rules

1. **If a scenario cannot be built as written, or an FR looks wrong, stop and propose the change with its reason.** A wrong contract gets built exactly.
2. **Claim only what you ran.** Every "fails", "passes" or "gate green" comes from a command run in this session, shown with its output.
3. **Build only what the current phase's scenarios ask for.** Write anything else down as a proposal for the person. Unasked scope does not fit the time box.
4. **Checkpoints hold even when a prompt says to finish without stopping.** The feature review stops the work, and each step ends in a commit.
5. **Rewrite docs in place.**
   - Never write "was X, now Y": git keeps the history.
   - Add to `DECISIONS.md` only a decision that is expensive to reverse, and only once the person agrees.
   - Keep `docs/design.md` near ten pages.
   - Ask before you create a new document.
6. **Scenarios assert outcomes the user sees.** Never internal names, message wording, or where a run ends, which break on every later change. Write unit tests where there is logic. A recorded runner reply checks the request it answers.
7. **Port a piece from `~/git/outside-in-dev` only through steps 2–4, with new tests.** Never copy its tests. Never bring back what `docs/design.md` §8 leaves behind.
8. **When a check or an agent fails, fix the tool output, a boundary or a helper first.** Propose new rules, here or in a prompt, to the person; do not add them yourself.
9. **Before you say what code or a dependency does, read the code, its callers and its tests, or run it on the pinned version.**
10. **Never read `.env` files, keys or credentials.**

## Gate

`npm run gate` runs these, in order:

```bash
npx tsc --noEmit
npx vitest run
NODE_OPTIONS="--import tsx" npx cucumber-js
```

The first Skeleton FR creates the script. An FR that adds a check adds it to the script. A check that ran no test fails. Until the script exists, commit only docs.

## Commits and build log

- Commit types: `spec(<FR>)`, `test(<FR>)`, `feat(<FR>)`, `fix(<FR>)`, `refactor(<FR>)`, `docs`, `chore`. One logical change per commit.
- `docs/build-log.md` gets one line per FR, in its table's columns. Count interventions by kind (contract, stuck, other). The note is one sentence.
