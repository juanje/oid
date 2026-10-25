@FR-RUN-04
Feature: The agent may ask for another kind of attempt

  Background:
    Given a project where FR-GREET-01 is built and FR-GREET-02 has an approved feature file with two scenarios
    And FR-GREET-01's shared Then step checks the greeting of the name its When step kept, not the greeting the scenario got
    And the run allows no retries

  Scenario: A code attempt that finds the cause in a shared step asks for a steps attempt, which fixes it, and the run goes on
    Given the scripted code attempt for the first scenario of FR-GREET-02 asks for a steps attempt, saying why
    And the scripted steps attempt it asks for fixes the shared Then step
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was asked for every prepared attempt, in order
    And the steps attempt asked for was given the reason and the scenario's failure
    And the summary counts one request, and one attempt asked for accepted
    And every scenario of FR-GREET-02 passes on the run's branch

  Scenario: A steps attempt asked for that turns a scenario that passed red is not accepted
    Given the scripted code attempt for the first scenario of FR-GREET-02 asks for a steps attempt, saying why
    And the scripted steps attempt it asks for changes the shared steps so that FR-GREET-01's scenario fails
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the output names FR-GREET-01's scenario as one that turned red
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A steps attempt asked for that loosens a Then step, so that its scenario passes on the code from before it, is not accepted
    Given the scripted code attempt for the first scenario of FR-GREET-02 asks for a steps attempt, saying why
    And the scripted steps attempt it asks for fixes the shared Then step
    And the scripted code attempt for the second scenario asks for a steps attempt, which loosens the shared Then step
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the output names the second scenario as passing on the code from before its own
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A code attempt that finds two unit tests contradicting each other asks for a test attempt, which fixes one, and the run goes on
    Given the scripted code attempt for the first scenario of FR-GREET-02 asks for a steps attempt, saying why
    And the scripted steps attempt it asks for fixes the shared Then step
    And the scripted test attempt for the second scenario writes two tests that contradict each other, and its code attempt asks for a test attempt, saying why
    And the scripted test attempt it asks for changes the second test so that it agrees with the first and still fails on the code from before
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was asked for every prepared attempt, in order
    And the test attempt asked for was given the reason
    And the summary counts two requests, and two attempts asked for accepted
    And every scenario of FR-GREET-02 passes on the run's branch

  Scenario: A test attempt asked for that loosens a red test, so that it passes on the code from before it, is not accepted
    Given the scripted code attempt for the first scenario of FR-GREET-02 asks for a steps attempt, saying why
    And the scripted steps attempt it asks for fixes the shared Then step
    And the scripted test attempt for the second scenario writes two tests that contradict each other, and its code attempt asks for a test attempt, saying why
    And the scripted test attempt it asks for loosens the second test so that it passes on the code from before
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the output names the second test as passing before its code
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A test attempt asked for that removes a unit test is not accepted
    Given the scripted code attempt for the first scenario of FR-GREET-02 asks for a steps attempt, saying why
    And the scripted steps attempt it asks for fixes the shared Then step
    And the scripted test attempt for the second scenario writes two tests that contradict each other, and its code attempt asks for a test attempt, saying why
    And the scripted test attempt it asks for removes the second test
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the output says the attempt left fewer unit tests
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A request from an accepted attempt after which the scenario passes is not followed, and the scenario is built
    Given the scripted code attempt for the first scenario of FR-GREET-02 asks for a steps attempt, saying why
    And the scripted steps attempt it asks for fixes the shared Then step, and asks for a code attempt
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the executor was asked for every prepared attempt, in order
    And the output says the steps attempt's request was not followed
