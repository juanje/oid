@FR-REF-02
Feature: The code pass

  Background:
    Given a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios
    And the scripted code attempt for FR-GREET-02 copies the greeting function's name check into its new function, with other names and another message
    And the run allows no retries

  Scenario: A cleanup that extracts the shared check is accepted, and the FR's commit holds it
    Given the scripted cleanup attempt extracts the shared check into a helper that both functions call
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the FR's commit has the name check in one place
    And every scenario and unit test passes on the run's branch
    And the output reports the cleanup item as accepted

  Scenario Outline: A cleanup that <breaks a rule> is not accepted, and the FR is committed with its code as before the cleanup
    Given the scripted cleanup attempt <breaks a rule>
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the FR's commit has the code the code attempt left
    And the output reports the cleanup item as not accepted

    Examples:
      | breaks a rule                                      |
      | edits a unit test                                  |
      | breaks a scenario                                  |
      | changes the signature of an exported function      |
      | leaves the duplication in place                    |
      | adds another duplication                           |
      | leaves a branch that no test runs                  |
      | makes the new function more complex than it was    |
