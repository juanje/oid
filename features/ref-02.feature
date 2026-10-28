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

  Scenario: A cleanup that shortens the duplication without removing it is refused as still there, and its retry, given its diff, finishes it
    Given the run allows 1 retry
    And the scripted cleanup attempt extracts part of the shared check, leaving a shorter copy in both functions, and its retry extracts the rest
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the retried cleanup attempt was given a refusal that says the duplication is still there, naming both functions
    And the retried cleanup attempt was given the refused attempt's diff
    And the output reports the cleanup item as accepted
    And the FR's commit has the name check in one place

  Scenario: A cleanup that moves the duplication into another pair of functions is refused as adding a new finding
    Given the scripted cleanup attempt removes the copy from the new function and repeats the check in a third function
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the output reports the cleanup item as not accepted
    And the run's log gives the cleanup's refusal as a new finding
