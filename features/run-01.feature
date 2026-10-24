@FR-RUN-01
Feature: Run one FR on approved features

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And a scripted executor whose steps, test and code attempts build FR-GREET-01
    And the run allows no retries

  Scenario: The FR is built in one commit on the run's branch
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the run's branch has exactly one commit on top of the starting HEAD
    And that commit holds the FR's step definitions, unit test and source
    And every scenario of FR-GREET-01 passes on the run's branch
    And the feature file of FR-GREET-01 is unchanged on the run's branch

  Scenario: The person's working copy is left as it was
    Given I have an uncommitted change in my working copy
    When I run "oid run FR-GREET-01"
    Then my working copy, its current branch and its HEAD are as they were
    And the run's commit does not contain my uncommitted change

  @FR-EVID-02
  Scenario: A test that passes before its code is not committed
    Given the scripted test attempt writes a test that passes without its code
    When I run "oid run FR-GREET-01"
    Then the run stops with a refusal, not a crash
    And the output names the test that passed without its code
    And the run's branch has no commit on top of the starting HEAD

  @FR-GATE-01
  Scenario: Code with a type error is not committed
    Given the scripted code attempt passes the tests but leaves a type error
    When I run "oid run FR-GREET-01"
    Then the run stops with a refusal, not a crash
    And the output names the type check and the file with the error
    And the run's branch has no commit on top of the starting HEAD

  @NFR-02
  Scenario: oid run with an option it does not know is an error and runs nothing
    When I run "oid run FR-GREET-01 --retries 3"
    Then the run stops with an error, not a refusal and not a crash
    And the output names the option "--retries"
    And the run created no branch
    And the executor was asked for no attempt
