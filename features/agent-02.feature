@FR-AGENT-02
Feature: A prompt per agent, in two layers

  Background:
    Given a project with an approved feature file for FR-GREET-01
    And rg and fd are installed where Pi finds them, since oid runs Pi offline
    And oid runs its attempts with the Pi executor on a scripted model
    And the scripted model builds FR-GREET-01, writing each attempt's files and ending with a report
    And the run allows no retries

  Scenario: Each agent is told the paths it may write and the tools it has, as oid enforces them
    When I run "oid run FR-GREET-01"
    Then the run succeeds
    And each attempt's system prompt names every path its kind may write
    And each attempt's system prompt names every tool its agent was offered

  Scenario: Each kind of agent has its own prompt, and all share one account of oid
    When I run "oid run FR-GREET-01"
    Then the steps, test and code attempts each had a system prompt with parts the others lack
    And their system prompts share a part, word for word
