@offer @mutation
Feature: Principal request reaches the native OCM offer
  Scenario: Complete the configured synthetic journey
    Given a dedicated synthetic UX tenant is explicitly enabled
    And a signed-in "alphaPrincipal" browser session
    When I complete the configured request journey
    Then the native offer and its QR are available
