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
