@FR-STATE-01
Feature: Worktree and checkpoints

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And a scripted executor whose steps, test and code attempts build FR-GREET-01
    And the run allows no retries

  Scenario: Each accepted attempt is a checkpoint, and the FR's commit is their squash
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And each attempt after the first started from a checkpoint holding every attempt accepted before it
    And the run's branch has exactly one commit on top of the starting HEAD
    And that commit holds the FR's step definitions, unit test and source

  Scenario: The run's commits run none of the project's hooks
    Given the project has a pre-commit hook that refuses every commit
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the project's hook never ran

  Scenario: Two runs of the same FR never collide on a branch name
    When I run "oid run FR-GREET-01" twice, one after the other, with the clock fixed
    Then both runs succeed
    And each run has its own branch, with one commit on top of the starting HEAD

  Scenario Outline: When a run ends, its worktree is removed and its branch kept
    Given the run will end <how>
    When I run "oid run FR-GREET-01"
    Then the run's worktree is gone
    And the run's branch is kept
    And the run's checkpoints are <checkpoints>

    Examples:
      | how               | checkpoints                    |
      | with the FR built | gone, squashed on its branch   |
      | on a refusal      | kept for a later resume        |
