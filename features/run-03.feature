@FR-RUN-03
Feature: The inner loop

  Background:
    Given a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios
    And a scripted executor that builds the first scenario of FR-GREET-02 and then the second
    And the run allows no retries

  Scenario: Test and code attempts repeat until the scenario passes
    Given the run allows 1 retry
    And the first scenario of FR-GREET-02 still fails after its first test and code attempts
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

  Scenario: A test file that defines no vitest test goes back to a test attempt, not to the code
    Given the run allows 1 retry
    And the scripted test attempt for the first scenario writes its test with node:test, and its retry with vitest
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was asked for every prepared attempt, in order
    And the retried test attempt was told its test file defines no vitest test, naming the file
    And no code attempt was asked to fix that test file

  Scenario: A round that adds no test spends a retry, and when the retries run out the run stops with what each attempt kind reported
    Given the run allows 1 retry
    And the scripted steps attempt for the first scenario keeps the greeting where its Then step never looks
    And the scripted test attempts after its first round add no test, each reporting why
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And no test attempt that added no test was accepted
    And the executor was asked for every prepared attempt, in order
    And the output names the first scenario, the step where it still fails, and its failure
    And the output gives the last report of each attempt kind

  Scenario: A round whose code leaves the scenario failing the same way spends a retry; one that moves the failure on does not
    Given the scripted steps attempt for the first scenario keeps the greeting where its Then step never looks
    And the scripted second round for the first scenario adds a test and its code, and the scenario still fails the same way
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the executor was asked for every prepared attempt, in order
    And the output names the first scenario, the step where it still fails, and its failure
