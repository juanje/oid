@FR-EVID-02
Feature: Judge the evidence of a new test

  Background:
    Given a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios
    And a scripted executor that builds the first scenario of FR-GREET-02 and then the second
    And the run allows no retries

  Scenario: A new test added to a file whose tests already pass is judged on its own
    Given the scripted test attempt for the second scenario adds its test to the first scenario's test file
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was asked for every prepared attempt, in order
    And every scenario of FR-GREET-02 passes on the run's branch

  Scenario: A new test added to an existing test file that passes before its code is not committed
    Given the scripted test attempt for the second scenario adds a test that passes without its code to the first scenario's test file
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the output names the new test that passed without its code
    And the output does not name the tests that were already in the file
    And the run's branch has no commit on top of the starting HEAD
