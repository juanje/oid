@FR-RUN-02
Feature: One scenario at a time, Red first

  Background:
    Given a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios
    And a scripted executor that builds the first scenario of FR-GREET-02 and then the second
    And the run allows no retries

  Scenario: The scenarios are built one after the other, in file order
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was asked for every prepared attempt, in order
    And every scenario of FR-GREET-02 passes on the run's branch

  Scenario: Step definitions that pass before their code are not committed
    Given the scripted steps attempt for the first scenario writes step definitions that pass without code
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the output names the scenario that passed without its code
    And the run's branch has no commit on top of the starting HEAD
