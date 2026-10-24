@FR-GATE-01
Feature: The gate

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And a scripted executor whose steps, test and code attempts build FR-GREET-01
    And the run allows no retries

  Scenario: An FR for which cucumber-js finds no scenario is an error before any attempt
    Given the project's cucumber-js configuration looks for feature files where there are none
    When I run "oid run FR-GREET-01"
    Then the run stops with an error, not a refusal and not a crash
    And the output names FR-GREET-01
    And the executor was asked for no attempt
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A check that does not know an option is an error, not a failure
    Given the project's TypeScript configuration has an option its tsc does not know
    When I run "oid run FR-GREET-01"
    Then the run stops with an error, not a refusal and not a crash
    And the output names the type check and the option it does not know
    And the run's branch has no commit on top of the starting HEAD
