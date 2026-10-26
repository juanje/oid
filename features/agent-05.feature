@FR-AGENT-05
Feature: No shell; read everything except secrets and noise

  Background:
    Given rg and fd are installed where Pi finds them, since oid runs Pi offline
    And oid runs its attempts with the Pi executor on a scripted model
    And a project with an approved feature file for FR-GREET-01
    And the run allows no retries
    And a file outside the run's worktree holds a secret
    And the project has a committed symlink to that file

  Scenario Outline: A file tool refuses a path that leads out of the run's worktree
    Given the scripted model's steps attempt first calls <tool> on <path>, then builds FR-GREET-01
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the model was told that call was refused, naming the path and why
    And the secret never reached the model
    And the file outside the worktree is unchanged
    And the run's log counts 1 denied tool call

    Examples:
      | tool  | path                                  |
      | read  | the file's absolute path              |
      | read  | a path from ~ that leads to the file  |
      | read  | the symlink                           |
      | write | the file's absolute path              |
      | edit  | the symlink                           |
      | grep  | the directory that holds the file     |
      | ls    | the directory that holds the file     |
      | find  | the directory that holds the file     |

  Scenario: Secret-shaped files and noise inside the worktree are refused, and left out of every listing and search
    Given the project has a committed .env that holds a secret
    And the scripted model's steps attempt first reads .env and .git, lists the worktree, finds all its files and searches it for the secret, then builds FR-GREET-01
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the model was told the reads of .env and .git were refused, naming each path and why
    And the secret never reached the model
    And no listing or search the model got names .env or anything under .git
    And the run's log counts 2 denied tool calls

  Scenario: oid's state under .oid/ is refused, and left out of every listing and search
    Given the project has a committed .oid/progress.json
    And the scripted model's steps attempt first reads .oid/progress.json, lists the worktree and finds all its files, then builds FR-GREET-01
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the model was told the read of .oid/progress.json was refused, naming the path and why
    And no listing or search the model got names anything under .oid
    And the run's log counts 1 denied tool call
