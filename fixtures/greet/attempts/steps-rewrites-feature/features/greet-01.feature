@FR-GREET-01
Feature: Greet a person by name

  Scenario: A person is greeted by name
    When I greet "Ada"
    Then I get "Hello, Ada"
