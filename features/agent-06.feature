@FR-AGENT-06
Feature: The try tool

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And a scripted executor whose steps, test and code attempts build FR-GREET-01
    And the run allows no retries

  Scenario: An attempt tries its new test and gets a failure shaped like a refusal
    Given the scripted test attempt tries its new test before it ends
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the test attempt got a failure for its new test, with what failed, the evidence and the next step

  Scenario: try checks the types of the files the attempt changed
    Given the scripted code attempt writes a type error and tries the scenario of FR-GREET-01 before it ends
    When I run "oid run FR-GREET-01"
    Then the code attempt got a failure that names the type check and the file with the error

  Scenario: A test that passed under try is still judged by oid
    Given the scripted test attempt writes a test that passes without its code and tries it before it ends
    When I run "oid run FR-GREET-01"
    Then the test attempt got a pass for its new test
    And the run stops with a refusal, not a crash
    And the output names the test that passed without its code
    And the run's branch has no commit on top of the starting HEAD
