@FR-GATE-04
Feature: A failing gate is a refusal

  Background:
    Given a project where FR-GREET-01 and FR-GREET-02 are built and FR-GREET-03 has an approved feature file
    And a scripted executor that builds FR-GREET-03 with a new function in the module of FR-GREET-01
    And the run allows 1 retry

  Scenario: A scenario the gate finds failing goes back to a code attempt, with the failure as evidence
    Given the scripted code attempt for FR-GREET-03 breaks a scenario of FR-GREET-02 that no unit test covers, and its retry does not
    When I run "oid run FR-GREET-03"
    Then the run succeeds
    And the retried code attempt was given the gate's failure, naming the scenario of FR-GREET-02 it broke
    And every scenario of FR-GREET-02 passes on the run's branch

  Scenario: When the code attempts after the gate run out, the run stops with the gate's refusal
    Given the scripted code attempt for FR-GREET-03 breaks a scenario of FR-GREET-02 that no unit test covers, and so does its retry
    When I run "oid run FR-GREET-03"
    Then the run stops with a refusal, not a crash
    And the executor was asked for every prepared attempt, in order
    And the output names the scenario of FR-GREET-02 that fails
    And the run's branch has no commit on top of the starting HEAD
