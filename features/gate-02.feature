@FR-GATE-02
Feature: Coverage of the FR's new branches

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And a scripted executor whose steps, test and code attempts build FR-GREET-01
    And the run allows 1 retry

  Scenario: A branch the FR added that no test runs, unit test or scenario, is refused at the gate, even on a line a test covers
    Given the scripted code attempt adds a branch on a line its test covers, which no test takes, and its attempt after the gate removes it
    And the scripted test attempt after the gate adds no test and reports that no requirement asks for the branch
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the code attempt after the gate was given the uncovered branch, naming its file and line
    And the run's log counts the gate's refusal as a rejection of the code attempt

  Scenario: A branch only a scenario runs is covered
    Given the scripted code attempt adds a branch that only a scenario of the FR takes
    When I run "oid run FR-GREET-01"
    Then the run succeeds

  Scenario: On vitest 5, a branch the FR added that no test runs is refused at the gate
    Given the project's vitest is version 5
    And the scripted code attempt adds a branch on a line its test covers, which no test takes, and its attempt after the gate removes it
    And the scripted test attempt after the gate adds no test and reports that no requirement asks for the branch
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the code attempt after the gate was given the uncovered branch, naming its file and line

  Scenario: On vitest 5, a branch only a scenario runs is covered
    Given the project's vitest is version 5
    And the scripted code attempt adds a branch that only a scenario of the FR takes
    When I run "oid run FR-GREET-01"
    Then the run succeeds

  Scenario: A branch the FR added in any of the project's source paths, which no test runs, is refused at the gate
    Given the project's .oid.json gives the source the paths src/ and shared/
    And the scripted code attempt also adds, under shared/, a branch no test takes, and its attempt after the gate removes it
    And the scripted test attempt after the gate adds no test and reports that no requirement asks for the branch
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the code attempt after the gate was given the uncovered branch, naming its file under shared/ and its line

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

  Scenario: A branch the SPEC asks for, which no test runs, is covered by a test attempt after the gate, with a mutant as its Red
    Given the scripted code attempt adds a branch the SPEC states, on a line its test covers, which no test takes
    And the scripted test attempt after the gate adds a unit test that takes the branch, with a mutant of the branch on which it fails
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the test attempt after the gate was given the uncovered branch, naming its file and line
    And the executor was not asked for a code attempt after the gate
    And the run's commit holds the new unit test and the branch

  Scenario: A branch no requirement asks for goes from the test attempt to a code attempt, which removes it
    Given the scripted code attempt adds a branch on a line its test covers, which no test takes
    And the scripted test attempt after the gate adds no test and reports that no requirement asks for the branch
    And the scripted code attempt after the gate removes the branch
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the code attempt after the gate was given the uncovered branch and the test attempt's report
    And the output lists the removed branch with the test attempt's report

  Scenario: A test attempt for an uncovered branch whose test does not take it is refused, and its retry covers it
    Given the run allows 2 retries
    And the scripted code attempt adds a branch the SPEC states, on a line its test covers, which no test takes
    And the scripted test attempt after the gate adds a unit test of other behaviour, with a mutant on which it fails, and its retry adds a unit test that takes the branch, with a mutant of the branch on which it fails
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the test attempt's retry after the gate was given a refusal that names the branch still untaken
    And the executor was not asked for a code attempt after the gate

  Scenario: A code attempt that moves an uncovered branch instead of removing it is refused
    Given the run allows 2 retries
    And the scripted code attempt adds a branch on a line its test covers, which no test takes
    And the scripted test attempt after the gate adds no test and reports that no requirement asks for the branch
    And the scripted code attempt after the gate moves the branch into a new helper function, and its retry removes it
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the code attempt's retry after the gate was given a refusal that says the branch was moved, not removed

  Scenario: A branch the test attempt cannot cover, and does not report as unasked for, stops the run instead of going to a code attempt
    Given the run allows 1 retry
    And the scripted code attempt adds a branch the SPEC states, on a line its test covers, which no test takes
    And the scripted test attempt after the gate adds a unit test of other behaviour, with a mutant on which it fails, and so does its retry
    When I run "oid run FR-GREET-01"
    Then the run stops with a refusal, not a crash
    And the output names the branch still untaken and the test attempt's last refusal
    And the executor was not asked for a code attempt after the gate
    And the run's branch has no commit on top of the starting HEAD
