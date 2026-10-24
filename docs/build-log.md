# Build log

One line per FR (AGENTS.md, "Commits and the build log").

| FR | date | interventions by kind | gate time | note |
|:--|:--|:--|:--|:--|
| FR-RUN-01 | 2026-10-24 | contract 3, stuck 0, other 3 | 10 s | The thinnest slice: a worktree from HEAD, the scripted executor, a no-pass check on new tests, a gate of types, unit suite and scenarios, and one commit. |
| FR-RUN-02 | 2026-10-24 | contract 0, stuck 0, other 0 | 47 s | Scenarios come from a cucumber dry run on the FR tag and are built in file order; a steps attempt counts only when its scenario ran and failed. |
| FR-RUN-03 | 2026-10-24 | contract 0, stuck 0, other 1 | 47 s | Rounds of test and code repeat until the scenario passes; code counts only when the whole unit suite passes and no green scenario of the feature turns red. |
| FR-EVID-01 | 2026-10-24 | contract 2, stuck 0, other 2 | 35 s | Failures get DOMAIN's Red classes: a scenario by its deciding step, a test by its message, and "X is not a function" by whether the module the failing file imports X from exports it. |
| FR-EVID-02 | 2026-10-24 | contract 0, stuck 0, other 0 | 35 s | A test attempt is judged on the tests that were not there before it, known from a unit-suite run at the start and after each code attempt. |
| FR-AGENT-04 | 2026-10-24 | contract 0, stuck 0, other 1 | 47 s | Every attempt's diff stays under its kind's paths, kept in one place in the code, and adds no .only, .skip or process.env.VITEST line. |
| FR-AGENT-06 | 2026-10-24 | contract 0, stuck 0, other 1 | 47 s | try runs a test file or the attempt's scenario, then the type check on the files the attempt changed, and records nothing. |
| FR-AGENT-07 | 2026-10-24 | contract 0, stuck 0, other 1 | 47 s | Attempts end through the report tool; one with no report, or an empty result, is refused. |
| FR-GATE-01 | 2026-10-24 | contract 1, stuck 0, other 0 | 48 s | A check that ran nothing fails; an FR with no scenario, or a runner that does not know an option, stops the run with exit 2. |
