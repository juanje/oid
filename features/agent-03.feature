@FR-AGENT-03
Feature: What each agent sees

  Background:
    Given rg and fd are installed where Pi finds them, since oid runs Pi offline
    And oid runs its attempts with the Pi executor on a scripted model

  Scenario: Every task gives the FR's what and why, and the steps of its scenario
    Given a project with an approved feature file for FR-GREET-01
    And the run allows no retries
    And the scripted model builds FR-GREET-01, writing each attempt's files and ending with a report
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And every attempt's task gives FR-GREET-01's text from SPEC.md and the steps of its scenario

  Scenario: Once the steps fail, the task gives their failure and the step definition it points to
    Given a project with an approved feature file for FR-GREET-01
    And the run allows no retries
    And the scripted model builds FR-GREET-01, writing each attempt's files and ending with a report
    When I run "oid run FR-GREET-01"
    Then the test and code attempts' tasks give the scenario's failure and the source of the step definition it failed in

  Scenario: An attempt sees the source its scenario's steps reach, and the unit tests that import it
    Given a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios
    And the run allows no retries
    And the scripted model builds FR-GREET-02
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the code attempt for FR-GREET-02's second scenario was given the source its steps import and the unit tests that import that source

  Scenario: The steps attempt sees the step definitions the project already has
    Given a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios
    And the run allows no retries
    And the scripted model builds FR-GREET-02
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And each steps attempt was given the patterns of the step definitions the project had when it started

  Scenario: The code attempt after a gate failure sees the broken scenario, its steps and its failure
    Given a project where FR-GREET-01 and FR-GREET-02 are built and FR-GREET-03 has an approved feature file
    And the run allows 1 retry
    And the scripted model builds FR-GREET-03, its code attempt breaking a scenario of FR-GREET-02 that no unit test covers, and its attempt after the gate fixing it
    When I run "oid run FR-GREET-03"
    Then the run succeeds
    And the code attempt after the gate was given the broken scenario of FR-GREET-02, its steps and its failure

  Scenario: The task of a steps attempt the gate sends back opens with its job and the gate's type error, before the FR and its scenario
    Given a project where FR-GREET-01 and FR-GREET-02 are built and FR-GREET-03 has an approved feature file
    And the run allows 1 retry
    And the scripted model builds FR-GREET-03, its steps attempt leaving a type error that no test catches, and its steps attempt after the gate fixing it
    When I run "oid run FR-GREET-03"
    Then the run succeeds
    And the steps attempt after the gate was given its job and the gate's type error before FR-GREET-03's text and its scenario's steps
    And every other attempt's task opens with its kind's usual work, before any refusal

  Scenario: The task of an attempt another one asked for opens with its job and the request, before the FR and its scenario
    Given a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios
    And FR-GREET-01's shared Then step checks the greeting of the name its When step kept, not the greeting the scenario got
    And the run allows no retries
    And the scripted model builds FR-GREET-02, its first scenario's code attempt asking for a steps attempt, which fixes the shared Then step
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the steps attempt asked for was given its job, the code attempt's reason and the scenario's failure before FR-GREET-02's text and its scenario's steps
    And every other attempt's task opens with its kind's usual work, before any refusal

  Scenario: A retry after the attempt's own refusal keeps its task as it was
    Given a project with an approved feature file for FR-GREET-01
    And the run allows 1 retry
    And the scripted model builds FR-GREET-01, its first test attempt writing a test that passes without its code
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And every other attempt's task opens with its kind's usual work, before any refusal

  Scenario Outline: The task gives the project's domain and its conventions, wherever the project keeps them
    Given a project with an approved feature file for FR-GREET-01
    And the run allows no retries
    And the project keeps its domain in <domain> and its conventions in <conventions>
    And the scripted model builds FR-GREET-01, writing each attempt's files and ending with a report
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And every attempt's task gives the project's domain and its conventions

    Examples:
      | domain                               | conventions                         |
      | DOMAIN.md                            | CONVENTIONS.md                      |
      | the Domain section of SPEC.md        | the Conventions section of SPEC.md  |
      | docs/glossary.md, named in .oid.json | docs/style.md, named in .oid.json   |
