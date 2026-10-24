@FR-CLI-01
Feature: The end-of-run summary

  Background:
    Given a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios
    And a scripted executor that builds the first scenario of FR-GREET-02 and then the second
    And the run allows no retries

  Scenario: A run that builds its FR ends with what it built, its evidence and its measures
    When I run "oid run FR-GREET-02"
    Then the run's summary marks both scenarios of FR-GREET-02 built, each with the classes of its Reds
    And the run's summary names the run's branch
    And the run's summary gives the run's attempts, rejections and time
    And the run's summary names the run's log file

  Scenario: A run that stops ends with what is built and where it stopped
    Given the scripted steps attempt for the second scenario writes step definitions that pass without code
    When I run "oid run FR-GREET-02"
    Then the run's summary marks the first scenario of FR-GREET-02 built and the second not built
    And the run's summary says the run stopped at the steps attempt for the second scenario, on a refusal
    And the run's summary names the ref that keeps the run's checkpoints
    And the run's summary names the run's log file
