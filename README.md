# oid

oid (Outside-In Development) has coding agents build software from a contract you approve. You write the requirements in `SPEC.md` and the acceptance scenarios as feature files. oid runs agents that write the step definitions, the unit tests and the code, one scenario at a time, and accepts their work only on evidence: a test counts when oid has seen it fail without its code and pass with it, and an FR is done when the gate passes (types, the whole unit suite and every scenario). You get back a branch with one commit for the FR.

It is an early version: it builds one FR per run, in TypeScript projects that use vitest and cucumber-js.

## Install

oid runs from this checkout, with Node's own type stripping. It needs Node 22.19 or later.

```bash
git clone <this repository> oid
cd oid
npm install
npm link
```

`npm link` puts the `oid` command on your `PATH`. Building oid as a JavaScript package comes later.

A project oid runs on needs vitest's coverage provider, `@vitest/coverage-v8`, at its vitest's version: the gate refuses a branch the FR added that no test runs.

oid runs its agents with [Pi](https://github.com/earendil-works/pi). Pi must already have credentials for the provider you use, and its `rg` and `fd` binaries, in `~/.pi/agent/bin` or on your `PATH`: oid runs Pi offline, so Pi will not download them.

## Run

Name the model the agents run on, as Pi lists it (`pi --list-models`), in your own config, `~/.config/oid/config.json` (or `$XDG_CONFIG_HOME/oid/config.json`, or `$OID_CONFIG_DIR/config.json`):

```json
{ "model": "<provider>/<model>" }
```

The model is yours, not the project's: a project's `.oid.json` that names one is an error.

The project may commit a `.oid.json` with its `limits` (`retries`, `turns`, `rounds`) and the `paths` of its domain and conventions. oid reads it from the commit the run starts from, never from your uncommitted changes, and says so when you have some. Then, with the FR's feature files approved and committed:

```bash
oid run FR-AREA-01
```

The run works in its own worktree, beside the repository, and never touches your copy. As it goes, it prints a line as each stage starts (preparing the agent, the worktree, listing the scenarios, the unit tests as they are, the gate, the commit) and as each attempt starts and ends, with its verdict and its Reds. It ends with a summary: what it built, where it stopped, its attempts, tokens and cost. Then:

- **the branch** `oid/<FR>-<time>` holds one commit with the FR, when it was built;
- **the run's log** is in `.git/oid/runs/<run id>.jsonl`, and **each attempt's transcript** in `.git/oid/runs/<run id>/`;
- **the exit code** says how it ended: 0 built, 1 refused, 2 an error no attempt can fix, 3 a limit reached.

## Commands

- `oid run <FR>`: builds one FR.
- `oid help`: lists the commands.

For their usage and options, and the version: `oid --help`.

## More

What oid does and why: [`SPEC.md`](SPEC.md). Its terms and how the tools it drives behave: [`DOMAIN.md`](DOMAIN.md). How it works: [`docs/design.md`](docs/design.md).

## License

Licensed under the MIT License. See [LICENSE](LICENSE).
