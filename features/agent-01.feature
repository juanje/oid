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

  Scenario: A provider error that passes costs one provider retry of the attempt, not the run
    Given the scripted model answers the code attempt's first turn with a provider error, then builds it
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the run's log gives the code attempt one provider retry and no rejection

  Scenario: A billing or quota error is not retried
    Given the scripted model answers the code attempt with a provider error that says the account is out of credit
    When I run "oid run FR-GREET-01"
    Then the run stops with an error, not a refusal and not a crash
    And the scripted model was asked for one turn in the code attempt
    And the output names the provider error

  Scenario: The project's own Pi settings do not reach the agent
    Given the project has a .pi/settings.json that would change the agent's tools
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the model was offered the tools read, ls, find, grep, edit, write, try and report, and no shell

  Scenario: Pi runs the model my personal config names
    Given my personal config names the scripted model
    When I run "oid run FR-GREET-01" with the executor oid makes from its config
    Then the run succeeds
    And the run's log gives each attempt the scripted model's id, its turns, and tokens and cost above zero

  Scenario Outline: A run with no model it can use stops with an error before any attempt
    Given my personal config <names>
    When I run "oid run FR-GREET-01" with the executor oid makes from its config
    Then the run stops with an error, not a refusal and not a crash
    And the output names <named>
    And the run created no branch
    And the scripted model was asked nothing

    Examples:
      | names                                 | named                     |
      | names no model                        | my personal config's path |
      | names the model nowhere/no-such-model | nowhere/no-such-model     |

  @NFR-08
  Scenario: A model in the project's .oid.json is an error that says where the model belongs
    Given my personal config names the scripted model
    And the project's .oid.json names the model scripted/scripted-model
    When I run "oid run FR-GREET-01" with the executor oid makes from its config
    Then the run stops with an error, not a refusal and not a crash
    And the output names .oid.json and my personal config's path
    And the run created no branch
    And the scripted model was asked nothing

  @smoke
  Scenario: On a real model, oid runs as the person types it, and each attempt's use reaches the run log
    Given my personal config names the real model in OID_SMOKE_MODEL
    And the run uses oid's default limits, as a real run does
    When I run "oid run FR-GREET-01" with the oid command
    Then the run ends without an error or a crash
    And the run's log gives each attempt the real model's id, its turns, and tokens above zero
    And the run's summary is shown: what it built or not, where it stopped, its attempts and its cost
    And a copy of the run's log is kept outside the temporary directory, and its path is shown

  @FR-RUN-09
  Scenario: A turn that reaches the output limit is cut, and the agent may call its tools again
    Given the project's .oid.json sets the output limit to 200 tokens
    And the scripted model answers the code attempt's first turn with 1,000 tokens of output, then builds it in its next turn
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And the scripted model was asked for at most 200 tokens of output in each turn
    And the run's log counts one turn cut, in the code attempt
