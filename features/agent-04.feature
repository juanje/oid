@FR-AGENT-04
Feature: Write boundaries, checked on the diff

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And a scripted executor whose steps, test and code attempts build FR-GREET-01
    And the run allows no retries

  Scenario: A test attempt that also writes source is not committed
    Given the scripted test attempt also writes the source its test needs
    When I run "oid run FR-GREET-01"
    Then the run stops with a refusal, not a crash
    And the output names the source file the test attempt wrote
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A steps attempt that changes the feature file is not committed
    Given the scripted steps attempt also rewrites the feature file of FR-GREET-01
    When I run "oid run FR-GREET-01"
    Then the run stops with a refusal, not a crash
    And the output names the feature file
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A code attempt that changes the gate's configuration is not committed
    Given the scripted code attempt also changes the project's package.json
    When I run "oid run FR-GREET-01"
    Then the run stops with a refusal, not a crash
    And the output names package.json
    And the run's branch has no commit on top of the starting HEAD

  Scenario Outline: Added lines that let a check pass without the code working are not committed
    Given the scripted <attempt> attempt adds a line with <pattern>
    When I run "oid run FR-GREET-01"
    Then the run stops with a refusal, not a crash
    And the output names <pattern> and the file that has it
    And the run's branch has no commit on top of the starting HEAD

    Examples:
      | attempt | pattern            |
      | test    | .only              |
      | test    | .skip              |
      | code    | process.env.VITEST |
      | steps   | import(modulePath) |
      | test    | import(modulePath) |

  Scenario: A .oid.json whose paths for two kinds of attempt overlap is an error that names them
    Given the project's .oid.json gives the unit tests the path tests/ and the step definitions the path tests/steps/
    When I run "oid run FR-GREET-01"
    Then the run stops with an error, not a refusal and not a crash
    And the output names tests/ and tests/steps/
    And the executor was asked for no attempt

  Scenario: A code attempt that writes under .oid/ is not committed
    Given the scripted code attempt also writes .oid/progress.json
    When I run "oid run FR-GREET-01"
    Then the run stops with a refusal, not a crash
    And the output names .oid/progress.json
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A code attempt that writes source in another language than the project's is not committed
    Given the scripted code attempt writes the greeting function in src/greet.js
    When I run "oid run FR-GREET-01"
    Then the run stops with a refusal, not a crash
    And the output names src/greet.js and the project's source extension .ts
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A project whose .oid.json names JavaScript as a source extension may have JavaScript source
    Given the project's .oid.json sets the source extensions to .ts and .js
    And the scripted code attempt writes a helper in src/helper.js, which its TypeScript source imports
    When I run "oid run FR-GREET-01"
    Then the run succeeds

  Rule: Each kind of attempt writes where the project's .oid.json says

    Background:
      Given the project's files are where its .oid.json places them:
        | kind     | paths                        |
        | spec     | specs/SPEC.md                |
        | features | specs/features/              |
        | steps    | tests/steps/, tests/support/ |
        | tests    | tests/unit/                  |
        | code     | src/, shared/                |
      And the scripted attempts write their files under those paths

    Scenario: The FR is built within the paths its project names
      When I run "oid run FR-GREET-01"
      Then the run succeeds
      And the FR's commit has its step definitions under tests/steps/, its unit tests under tests/unit/, and its source under src/ and shared/
      And every attempt's task gives FR-GREET-01's text from specs/SPEC.md

    Scenario: A test attempt that writes under the step definitions' paths is not committed
      Given the scripted test attempt also writes a file under tests/steps/
      When I run "oid run FR-GREET-01"
      Then the run stops with a refusal, not a crash
      And the output names the file the test attempt wrote under tests/steps/
      And the run's branch has no commit on top of the starting HEAD

    Scenario: A code attempt that writes a runner's configuration under a source path is not committed
      Given the scripted code attempt also writes shared/vitest.config.ts
      When I run "oid run FR-GREET-01"
      Then the run stops with a refusal, not a crash
      And the output names shared/vitest.config.ts
      And the run's branch has no commit on top of the starting HEAD

    Scenario: A steps attempt that changes a file vitest's configuration loads is not committed
      Given the project's vitest configuration loads tests/support/setup.ts before the unit tests
      And the scripted steps attempt also changes tests/support/setup.ts
      When I run "oid run FR-GREET-01"
      Then the run stops with a refusal, not a crash
      And the output names tests/support/setup.ts
      And the run's branch has no commit on top of the starting HEAD
