@FR-GREET-02
Feature: Greet a group of people

  Scenario: Two people are greeted together
    When I greet "Ada" and "Grace"
    Then I get "Hello, Ada and Grace!"

  Scenario: Three people are greeted as a list
    When I greet "Ada", "Grace" and "Linus"
    Then I get "Hello, Ada, Grace and Linus!"
