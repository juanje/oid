@FR-EVID-01
Feature: Classify a failure

  Background:
    Given a project where FR-GREET-01 is built and FR-GREET-03 has an approved feature file
    And a scripted executor that builds FR-GREET-03 with a new function in the module of FR-GREET-01
    And the run allows no retries

  Scenario: A new test that asks for a function its module does not have yet is a Red
    When I run "oid run FR-GREET-03"
    Then the run succeeds
    And the output gives the new test's failure the class missing_implementation
    And every scenario of FR-GREET-03 passes on the run's branch

  Scenario: On vitest 5, a new test that asks for a function its module does not have yet is accepted provisionally, and confirmed when its code makes it pass
    Given the project's vitest is version 5
    When I run "oid run FR-GREET-03"
    Then the run succeeds
    And the output gives the new test's failure the class undecided, provisional
    And the output says the new test's Red is confirmed

  Scenario: A project whose vitest is neither version 3 nor version 5 is an error before any attempt
    Given the project's vitest is version 4
    When I run "oid run FR-GREET-03"
    Then the run stops with an error, not a refusal and not a crash
    And the output names the project's vitest version and the versions oid reads
    And the executor was asked for no attempt

  Scenario: A new test whose failure oid cannot classify is accepted provisionally, and confirmed when its code makes it pass
    Given the scripted test attempt fails with an error of its own while the function it asks for does not exist yet
    When I run "oid run FR-GREET-03"
    Then the run succeeds
    And the output gives the new test's failure the class undecided, provisional
    And the output says the new test's Red is confirmed

  Scenario: Steps whose failure oid cannot classify are accepted provisionally, and confirmed when the scenario passes
    Given the scripted steps attempt fails with an error of its own while the function it asks for does not exist yet
    When I run "oid run FR-GREET-03"
    Then the run succeeds
    And the output gives the scenario's failure the class undecided, provisional
    And the output says the scenario's Red is confirmed

  Scenario: A provisional Red that no code makes pass is refuted, and one test attempt repairs it
    Given the scripted test attempt calls the existing greeting function in a way that fails as "is not a function", and its repair calls the new function
    When I run "oid run FR-GREET-03"
    Then the run succeeds
    And the test attempt after the code attempts was given the refusal, naming the test as refuted
    And the executor was asked for every prepared attempt, in order

  Scenario: A refuted Red whose repair no code makes pass either stops the run
    Given the scripted test attempt calls a function the assertion package does not have, and so does its repair
    When I run "oid run FR-GREET-03"
    Then the run stops with a refusal, not a crash
    And the output names the test as refuted
    And the executor was asked for every prepared attempt, in order
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A provisional scenario Red that no code makes pass is refuted, and stops the run
    Given the scripted steps attempt asserts with a function the assertion package does not have
    And the scripted code attempt does not make its unit test pass
    When I run "oid run FR-GREET-03"
    Then the run stops with a refusal, not a crash
    And the output names the scenario as refuted
    And the run's branch has no commit on top of the starting HEAD

  Scenario: Step definitions that leave a step undefined are not accepted
    Given the scripted steps attempt leaves the Then step of FR-GREET-03 undefined
    When I run "oid run FR-GREET-03"
    Then the run stops with a refusal, not a crash
    And the output gives the failure the class test_bug
    And the output names the undefined step
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A scenario that fails in its Given step is not a Red
    Given the scripted steps attempt writes a Given step that fails because the code does not exist yet
    When I run "oid run FR-GREET-03"
    Then the run stops with a refusal, not a crash
    And the output gives the failure the class test_bug
    And the output names the Given step that failed
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A new test with a syntax error is not accepted
    Given the scripted test attempt writes a test file with a syntax error
    When I run "oid run FR-GREET-03"
    Then the run stops with a refusal, not a crash
    And the output gives the failure the class test_bug
    And the output names the test file
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A new test that imports a package that is not installed is not accepted
    Given the scripted test attempt writes a test that imports a package that is not installed
    When I run "oid run FR-GREET-03"
    Then the run stops with a refusal, not a crash
    And the output gives the failure the class environment
    And the output names the package
    And the run's branch has no commit on top of the starting HEAD

  Scenario: A new test that vitest does not run is not accepted
    Given the scripted test attempt writes its test in a file vitest does not collect
    When I run "oid run FR-GREET-03"
    Then the run stops with a refusal, not a crash
    And the output gives the failure the class not_run
    And the output names the file
    And the run's branch has no commit on top of the starting HEAD
