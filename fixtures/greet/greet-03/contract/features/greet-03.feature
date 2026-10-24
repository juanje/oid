@FR-GREET-03
Feature: Greet with a chosen salutation

  Scenario: A person is greeted with the chosen salutation
    Given the salutation is "Good morning"
    When I greet "Ada" with it
    Then the greeting is "Good morning, Ada!"
