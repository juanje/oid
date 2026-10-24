@FR-GATE-02
Feature: Coverage of the FR's new branches

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And a scripted executor whose steps, test and code attempts build FR-GREET-01
    And the run allows 1 retry

  Scenario: A branch the FR added that no test runs, unit test or scenario, is refused at the gate, even on a line a test covers
    Given the scripted code attempt adds a branch on a line its test covers, which no test takes, and its attempt after the gate removes it
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the code attempt after the gate was given the uncovered branch, naming its file and line
    And the run's log counts the gate's refusal as a rejection of the code attempt

  Scenario: A branch only a scenario runs is covered
    Given the scripted code attempt adds a branch that only a scenario of the FR takes
    When I run "oid run FR-GREET-01"
    Then the run succeeds

  Scenario: A branch that was there before the FR is not the FR's to cover
    Given the project already has a branch that no test takes
    When I run "oid run FR-GREET-01"
    Then the run succeeds

  Scenario: A branch no run takes in a step definition does not refuse the gate
    Given the scripted steps attempt writes a step definition with a branch no run takes
    When I run "oid run FR-GREET-01"
    Then the run succeeds

  Scenario: A project without vitest's coverage provider is an error before any attempt
    Given the project does not have @vitest/coverage-v8
    When I run "oid run FR-GREET-01"
    Then the run stops with an error, not a refusal and not a crash
    And the output names @vitest/coverage-v8
    And the executor was asked for no attempt
