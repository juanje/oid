@FR-EVID-03
Feature: A mutant where a Red is impossible

  Background:
    Given a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios
    And the scripted code attempt for the first scenario of FR-GREET-02 also builds the second scenario's behaviour
    And the run allows no retries

  Scenario: Steps whose scenario passes before its code are proved by a mutant that fails it on an assertion, and the scenario is built
    Given the scripted steps attempt for the second scenario submits a mutant that joins every name with and
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was asked for every prepared attempt, in order
    And the output gives the second scenario's Red the class business_assertion, through a mutant

  Scenario: A new unit test that passes before its code is proved by a mutant that fails it on an assertion
    Given the scripted steps attempt for the second scenario asks for a function that does not exist yet
    And the scripted test attempt for the second scenario writes a test of behaviour that exists already, and submits a mutant that joins every name with and
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the output gives the new test's Red the class business_assertion, through a mutant

  Scenario: A mutant that removes a function is not accepted: it shows that the scenario calls it, not that it checks it
    Given the scripted steps attempt for the second scenario submits a mutant that removes the greeting function
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the output names the mutant's failure as missing_implementation
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A mutant that edits a step definition is not accepted
    Given the scripted steps attempt for the second scenario submits a mutant that edits its own step definitions
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the output names the step definition file the mutant edits
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A mutant under which the scenario still passes is not accepted
    Given the scripted steps attempt for the second scenario submits a mutant that changes code the scenario does not run
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the output says the scenario still passes under the mutant
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A refused mutant is retried, and the retry's mutant is judged before its request: accepted, the scenario is built and the request is not followed
    Given the run allows 1 retry
    And the scripted steps attempt for the second scenario submits a mutant that changes code the scenario does not run
    And its retry submits a mutant that joins every name with and, and asks for a code attempt
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was asked for every prepared attempt, in order
    And the output gives the second scenario's Red the class business_assertion, through a mutant
    And the output says the steps attempt's request for the second scenario was not followed

  Scenario: A test attempt in a round after a code attempt submits a mutant and asks for a code attempt: the mutant is judged first, and the request is followed while the scenario fails
    Given the scripted steps attempt for the second scenario asks for a function that does not exist yet
    And the scripted first round for the second scenario writes that function, which greets one person but not a list
    And the scripted test attempt of its second round writes a test of behaviour that exists already, submits a mutant that joins every name with and, and asks for a code attempt that makes the function use it
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was asked for every prepared attempt, in order
    And the output gives the new test's Red the class business_assertion, through a mutant
    And the output says the test attempt's request for the second scenario was followed
