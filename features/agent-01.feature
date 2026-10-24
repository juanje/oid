@FR-AGENT-01
Feature: One attempt, one agent process

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And rg and fd are installed where Pi finds them, since oid runs Pi offline
    And oid runs its attempts with the Pi executor on a scripted model
    And the scripted model builds FR-GREET-01, writing each attempt's files and ending with a report
    And the run allows no retries

  Scenario: Each attempt runs a fresh Pi agent with its system prompt, its task and its tools
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the model saw, at each attempt, a system prompt and a task naming the attempt's kind and scenario, and nothing of the attempts before it
    And the model was offered the tools read, ls, find, grep, edit, write, try and report, and no shell
    And every scenario of FR-GREET-01 passes on the run's branch

  Scenario: The Pi executor reports each attempt's turns, model, tokens and cost, which the run log keeps
    When I run "oid run FR-GREET-01"
    Then the run's log gives each attempt the scripted model's id, its turns, and tokens and cost above zero

  Scenario: At the turn limit the Pi executor ends the agent between turns
    Given the run allows 3 turns per attempt
    And the scripted model keeps calling tools in the code attempt without ending it
    When I run "oid run FR-GREET-01"
    Then the run stops at a limit, not a refusal, an error or a crash
    And the scripted model was asked for 3 turns in the code attempt

  Scenario: A provider error that does not go away is an error, not a refusal
    Given the scripted model answers the code attempt with a provider error every time
    When I run "oid run FR-GREET-01"
    Then the run stops with an error, not a refusal and not a crash
    And the output names the provider error

  Scenario: The project's own Pi settings do not reach the agent
    Given the project has a .pi/settings.json that would change the agent's tools
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the model was offered the tools read, ls, find, grep, edit, write, try and report, and no shell

  @smoke
  Scenario: On a real model, each attempt runs and its use reaches the run log
    Given the Pi executor runs on the real model named in OID_SMOKE_MODEL, instead of the scripted one
    When I run "oid run FR-GREET-01"
    Then the run ends without an error or a crash
    And the run's log gives each attempt the real model's id, its turns, and tokens above zero
