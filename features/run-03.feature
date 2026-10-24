@FR-RUN-03
Feature: The inner loop

  Background:
    Given a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios
    And a scripted executor that builds the first scenario of FR-GREET-02 and then the second
    And the run allows no retries

  Scenario: Test and code attempts repeat until the scenario passes
    Given the first scenario of FR-GREET-02 still fails after its first test and code attempts
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was asked for every prepared attempt, in order
    And every scenario of FR-GREET-02 passes on the run's branch

  Scenario: Code that leaves its new tests failing is not committed
    Given the scripted code attempt for the first scenario leaves its new test failing
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the output names the test that still fails
    And the run's branch has no commit on top of the starting HEAD

  Scenario: Code that breaks a unit test that was green is not committed
    Given the scripted code attempt for the second scenario breaks the unit test of FR-GREET-01
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the output names the unit test that turned red
    And the run's branch has no commit on top of the starting HEAD

  Scenario: Code that breaks a scenario that was green is not committed
    Given the scripted code attempt for the second scenario breaks the first scenario of FR-GREET-02, and no unit test
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the output names the scenario that turned red
    And the run's branch has no commit on top of the starting HEAD
