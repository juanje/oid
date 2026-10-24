@FR-AGENT-07
Feature: The report tool

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And a scripted executor whose steps, test and code attempts build FR-GREET-01
    And the run allows no retries

  Scenario: An attempt that ends without a report is not committed
    Given the scripted code attempt ends without a report
    When I run "oid run FR-GREET-01"
    Then the run stops with a refusal, not a crash
    And the output names the code attempt that gave no report
    And the run's branch has no commit on top of the starting HEAD

  Scenario: An attempt whose report gives no result is not committed
    Given the scripted code attempt ends with a report whose result is empty
    When I run "oid run FR-GREET-01"
    Then the run stops with a refusal, not a crash
    And the output names the code attempt that gave no result
    And the run's branch has no commit on top of the starting HEAD
