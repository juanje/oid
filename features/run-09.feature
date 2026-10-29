@FR-RUN-09
Feature: Limits

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And a scripted executor whose steps, test and code attempts build FR-GREET-01
    And the run allows 1 retry
    And the run allows 3 turns per attempt

  Scenario: An attempt that reaches the turn limit ends the run, which says which limit
    Given the scripted code attempt would take 5 turns
    When I run "oid run FR-GREET-01"
    Then the run stops at a limit, not a refusal, an error or a crash
    And the code attempt was stopped after its third turn
    And the code attempt was not retried
    And the output names the turn limit and the code attempt
    And the run's branch has no commit on top of the starting HEAD

  Scenario: An attempt that uses exactly its turns is not stopped
    Given the scripted code attempt takes 3 turns
    When I run "oid run FR-GREET-01"
    Then the run succeeds

  Scenario: A scenario that reaches its limit of rounds ends the run, which says which limit, even when every round moves its failure on
    Given the run allows 2 rounds per scenario
    And the scripted steps attempt fails its Then step with a message that changes on every run
    And the scripted attempts build a second round for the scenario, a test and its code
    When I run "oid run FR-GREET-01"
    Then the run stops at a limit, not a refusal, an error or a crash
    And the executor was asked for every prepared attempt, in order
    And the output names the round limit, the scenario and its last failure
    And the output gives the last report of each attempt kind
    And the run's branch has no commit on top of the starting HEAD

  Scenario: Code that does not finish fails its check at the time limit, and the attempt is refused for it
    Given the project's .oid.json sets the check time limit to 5 seconds
    And the scripted code attempt writes a greeting function that never returns, and its retry builds it
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the code attempt's retry was given a refusal that says the unit tests did not finish within 5 seconds
    And the run's log counts one check stopped by the time limit
