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

  Scenario: A cleanup that leaves the duplication as long as it was is refused as still there, and its retry, given its diff, finishes it
    Given the run allows 1 retry
    And the scripted cleanup attempt renames the variables in both copies of the shared check, and its retry extracts the shared check
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the retried cleanup attempt was given a refusal that says the duplication is still there, naming both functions
    And the retried cleanup attempt was given the refused attempt's diff
    And the output reports the cleanup item as accepted
    And the FR's commit has the name check in one place

  Scenario: A cleanup that shortens the duplication is accepted, and the shorter copy is the next item
    Given the scripted cleanup attempt extracts part of the shared check, leaving a shorter copy in both functions
    And the scripted second cleanup attempt extracts the rest
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the second cleanup attempt's task gives the shorter copy's lines
    And the output reports both cleanup items as accepted
    And the FR's commit has the name check in one place

  Scenario: A cleanup that moves the duplication into another pair of functions is refused as adding a new finding
    Given the scripted cleanup attempt removes the copy from the new function and repeats the check in a third function
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the output reports the cleanup item as not accepted
    And the run's log gives the cleanup's refusal as a new finding

  Scenario: The cleanup's task holds the source's functions, with the bodies of those its finding calls
    Given the scripted code attempt for FR-GREET-02 copies the greeting function's name check into its new function, with other names and another message
    And the scripted cleanup attempt extracts the shared check
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the cleanup attempt's task names every function of the source with its signature
    And the cleanup attempt's task holds the body of each function the copied check calls

  Scenario: A cleanup's note reaches the person, and changes nothing
    Given the scripted code attempt for FR-GREET-02 copies the greeting function's name check into its new function, with other names and another message
    And the scripted cleanup attempt extracts the shared check, with the message as a parameter, and reports a note that the two messages differ
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the output reports the cleanup item as accepted
    And the output lists the cleanup's note that the two messages differ

  Scenario: A cleanup after another is given its finding with the lines the first one left
    Given the scripted code attempt for FR-GREET-02 copies the greeting function's name check and its punctuation check into its new function, with other names and another message
    And the scripted first cleanup attempt extracts the shared name check, which moves the punctuation copies' lines
    And the scripted second cleanup attempt extracts the shared punctuation check
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the second cleanup attempt's task gives the punctuation copies' lines as the first cleanup left them
    And the output reports both cleanup items as accepted
    And the FR's commit has the punctuation check in one place

  Scenario: A finding that an earlier cleanup removed gets no cleanup item
    Given the scripted code attempt for FR-GREET-02 copies the greeting function's name check and its punctuation check into its new function, with other names and another message
    And the scripted first cleanup attempt extracts both shared checks into one helper
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was asked for one cleanup attempt
    And the output reports one cleanup item, accepted

  Scenario: A shortened duplication is kept when the cleanup of its remainder is not accepted
    Given the scripted cleanup attempt extracts part of the shared check, leaving a shorter copy in both functions
    And the scripted second cleanup attempt changes nothing in the shorter copy
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the output reports the first cleanup item as accepted and the second as not accepted
    And the FR's commit has the first cleanup's helper
