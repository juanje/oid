@FR-RUN-05
Feature: Several FRs in one run

  Background:
    Given a project where FR-GREET-01 is built and FR-GREET-02 and FR-GREET-03 have approved feature files
    And the run allows no retries

  Scenario: Two FRs are built in the order given, one commit each, and the first FR's gate leaves out the second's scenarios
    Given a scripted executor that builds FR-GREET-02 and then FR-GREET-03
    When I run "oid run FR-GREET-02 FR-GREET-03"
    Then the run succeeds
    And the run's branch has one commit per FR on top of the starting HEAD, FR-GREET-02's first
    And the output lists FR-GREET-03's scenario as left out of FR-GREET-02's gate
    And every scenario of FR-GREET-02 and FR-GREET-03 passes on the run's branch

  Scenario: A run that stops at the second FR keeps the first FR's commit, and says which FRs were built and which stopped
    Given a scripted executor that builds FR-GREET-02, and whose code attempt for FR-GREET-03 leaves its new test failing
    When I run "oid run FR-GREET-02 FR-GREET-03"
    Then the run stops with a refusal, not a crash
    And the run's branch has one commit on top of the starting HEAD, FR-GREET-02's
    And the summary says FR-GREET-02 was built and FR-GREET-03 stopped

  Scenario: A run that stops at the first FR does not start the second
    Given a scripted executor whose code attempt for FR-GREET-02's first scenario leaves its new test failing
    When I run "oid run FR-GREET-02 FR-GREET-03"
    Then the run stops with a refusal, not a crash
    And the run's branch has no commit on top of the starting HEAD
    And the summary says FR-GREET-02 stopped and FR-GREET-03 was not started

  Scenario: The scenarios of an FR that is neither built nor in the run are left out of the gate
    Given a scripted executor that builds FR-GREET-02
    When I run "oid run FR-GREET-02"
    Then the run succeeds
    And the output lists FR-GREET-03's scenario as left out of FR-GREET-02's gate

  Scenario: A run whose base has a built scenario that fails is refused before any attempt
    Given FR-GREET-01's code no longer greets as its scenario says
    And a scripted executor that builds FR-GREET-02
    When I run "oid run FR-GREET-02"
    Then the run stops with a refusal, not a crash
    And the executor was asked for no attempt
    And the output names FR-GREET-01's scenario and its failure
    And the run's branch has no commit on top of the starting HEAD
