@FR-REF-01
Feature: Detect findings on the FR's diff

  Background:
    Given a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios

  Scenario: Code that copies a block already in the source, with other names and another message, starts a cleanup with that duplication
    Given the scripted code attempt for FR-GREET-02 copies the greeting function's name check into its new function, with other names and another message
    And the scripted cleanup attempt extracts the shared check
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the cleanup attempt's task names a duplication between the greeting function and the new function

  Scenario: Duplication that was in the source before the run, and that the FR does not touch, starts no cleanup
    Given the source of FR-GREET-01 already repeats a block that FR-GREET-02's code does not touch
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was not asked for a cleanup attempt

  Scenario: A function the FR makes more complex than the project's limit starts a cleanup with that function
    Given the project's complexity limit is 3
    And the scripted code attempt for FR-GREET-02 writes a new function with complexity 5
    And the scripted cleanup attempt splits that function
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the cleanup attempt's task names the new function's complexity

  Scenario: A function already above the limit, which the FR changes without making it more complex, starts no cleanup
    Given the project's complexity limit is 3
    And FR-GREET-01's greeting function already has complexity 5
    And the scripted code attempt for FR-GREET-02 changes a line of the greeting function without adding a decision
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was not asked for a cleanup attempt

  Scenario: The cleanup starts after the gate passes, on a tree where every check passes
    Given the project's complexity limit is 3
    And the scripted code attempt for FR-GREET-02 writes a new function with complexity 5
    And the scripted steps attempt for FR-GREET-02 leaves a type error in its step definitions, and its attempt after the gate fixes it
    And the scripted cleanup attempt splits that function
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was asked for the steps attempt after the gate before the cleanup attempt
    And the output reports the cleanup item as accepted
