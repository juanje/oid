@FR-CLI-05
Feature: The run shows its progress

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And a scripted executor whose steps, test and code attempts build FR-GREET-01
    And the run allows 1 retry

  Scenario: The run says when each stage starts, before its first attempt
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the output shows the stages agent, worktree, scenarios and unit tests starting, in that order, before the first attempt

  Scenario: After the last attempt, the run says when the gate and the commit start
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the output shows the stages gate and commit starting, in that order, after the last attempt

  Scenario: The run says when each attempt starts, with its kind and scenario, and when it ends, with its verdict
    Given the scripted code attempt is first refused, after writing a file that its retry does not write
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the output shows each attempt start and end, in order: steps accepted, test accepted, code refused, code accepted

  Scenario: Each Red says whether it is the scenario's or a unit test's, with its class
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the output gives the scenario's Red with the class missing_implementation
    And the output gives a unit test's Red with the class missing_implementation
