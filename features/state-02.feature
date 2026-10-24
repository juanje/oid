@FR-STATE-02
Feature: The run log and its measures

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And a scripted executor whose steps, test and code attempts build FR-GREET-01
    And the run allows 1 retry

  Scenario: The log records each attempt, in order, with its verdict, and a refused one with its refusal
    Given the scripted code attempt is first refused, after writing a file that its retry does not write
    When I run "oid run FR-GREET-01"
    Then the run's log lists the attempts steps, test, code and code, in that order
    And the log gives the first code attempt the verdict refused, with its refusal
    And the log gives every other attempt the verdict accepted

  Scenario: The log measures attempts and rejections per kind, and a retry that fails the same way is a blind retry
    Given the scripted code attempt is refused, and its retry fails the same way
    When I run "oid run FR-GREET-01"
    Then the run's log counts 2 code attempts and 2 code rejections
    And the run's log counts 1 blind retry

  Scenario: The log takes each attempt's model, tokens, cost, turns and denied tool calls from the executor, and oid totals them
    Given the scripted executor reports a model, tokens, cost, turns and denied tool calls for each attempt
    When I run "oid run FR-GREET-01"
    Then the run's log gives each attempt what the executor reported for it
    And the run's log totals the tokens, the cost and the denied tool calls of every attempt
    And the run's log gives the run's time, measured by oid

  Scenario: The log keeps everything up to where a run stops
    Given the run allows 3 turns per attempt
    And the scripted code attempt would take 5 turns
    When I run "oid run FR-GREET-01"
    Then the run's log lists the attempts steps, test and code, in that order
    And the run's log says the run stopped at the turn limit

  Scenario: Each attempt's transcript is kept next to the run's log, and the summary names where
    Given rg and fd are installed where Pi finds them, since oid runs Pi offline
    And oid runs its attempts with the Pi executor on a scripted model
    And the scripted model builds FR-GREET-01, writing each attempt's files and ending with a report
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And next to the run's log is a directory with one transcript per attempt, each holding that attempt's task
    And the run's summary names that directory
