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

  Scenario: A new test that calls a function that exists, wrongly, is undecided
    Given the scripted test attempt calls the existing greeting function in a way that fails as "is not a function"
    When I run "oid run FR-GREET-03"
    Then the run stops with a refusal, not a crash
    And the output gives the failure the class undecided
    And the output names the test
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

  Scenario: A failure oid cannot classify stops the run
    Given the scripted test attempt writes a test that fails reading a file that does not exist
    When I run "oid run FR-GREET-03"
    Then the run stops with a refusal, not a crash
    And the output gives the failure the class undecided
    And the output names the test
    And the run's branch has no commit on top of the starting HEAD
