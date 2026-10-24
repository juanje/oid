@FR-CLI-04
Feature: Help and version

  Background:
    Given a project with an approved feature file for FR-GREET-01

  Scenario Outline: oid lists its commands and how to use each
    When I run "<command>" with the oid command
    Then oid ends with exit code 0
    And the output lists every command oid has, with its usage
    And the run created no branch

    Examples:
      | command    |
      | oid        |
      | oid --help |
      | oid help   |

  Scenario: A command's --help gives its usage and runs nothing
    When I run "oid run --help" with the oid command
    Then oid ends with exit code 0
    And the output gives the usage of oid run
    And the run created no branch

  Scenario: oid --version prints the version of oid's package
    When I run "oid --version" with the oid command
    Then oid ends with exit code 0
    And the output is the version in oid's package.json

  Scenario: A command oid does not have is still an error, with the help
    When I run "oid shorten" with the oid command
    Then the run stops with an error, not a refusal and not a crash
    And the output names the command "shorten"
    And the output lists every command oid has, with its usage

  @NFR-07
  Scenario Outline: The help and the version load neither Pi nor the TypeScript compiler API
    When I run "<command>" with the oid command, recording the modules Node loads
    Then oid ends with exit code 0
    And the modules it loaded include oid's argument parser
    And it loaded no module of Pi, of typescript-api or of oid's run

    Examples:
      | command        |
      | oid            |
      | oid --version  |
      | oid --help     |
      | oid run --help |
