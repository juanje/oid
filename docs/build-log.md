# Build log

One line per FR (AGENTS.md, "Commits and the build log").

| FR | date | interventions by kind | gate time | note |
|:--|:--|:--|:--|:--|
| FR-RUN-01 | 2026-10-24 | contract 1, stuck 0, other 3 | 10 s | The thinnest slice: a worktree from HEAD, the scripted executor, a no-pass check on new tests, a gate of types, unit suite and scenarios, and one commit. |
| FR-RUN-02 | 2026-10-24 | contract 0, stuck 0, other 0 | 47 s | Scenarios come from a cucumber dry run on the FR tag and are built in file order; a steps attempt counts only when its scenario ran and failed. |
| FR-RUN-03 | 2026-10-24 | contract 0, stuck 0, other 1 | 47 s | Rounds of test and code repeat until the scenario passes; code counts only when the whole unit suite passes and no green scenario of the feature turns red. |
