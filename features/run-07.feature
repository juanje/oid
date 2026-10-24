@FR-RUN-07
Feature: Retries

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And a scripted executor whose steps, test and code attempts build FR-GREET-01
    And the run allows 1 retry

  Scenario: A refused attempt is retried from the work accepted before it, with its refusal
    Given the scripted code attempt is first refused, after writing a file that its retry does not write
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the retried code attempt was given the refusal of the attempt before it
    And the retried code attempt started from a tree without the file the refused attempt wrote
    And the run's commit does not hold the file only the refused attempt wrote

  Scenario: When the retries run out, the run stops with the last refusal
    Given the scripted code attempt is refused, and so is its retry
    When I run "oid run FR-GREET-01"
    Then the run stops with a refusal, not a crash
    And the output gives the refusal of the retry
    And the run's branch has no commit on top of the starting HEAD

  Scenario: An error is not retried
    Given the project's TypeScript configuration has an option its tsc does not know
    When I run "oid run FR-GREET-01"
    Then the run stops with an error, not a refusal and not a crash
    And the executor was asked for every prepared attempt, in order

  @NFR-08
  Scenario: The project's config comes from the run's HEAD, not from my uncommitted changes
    Given my working copy's .oid.json allows no retries, not committed
    And the scripted code attempt is first refused, after writing a file that its retry does not write
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the retried code attempt was given the refusal of the attempt before it
    And the output says the uncommitted .oid.json was not used
