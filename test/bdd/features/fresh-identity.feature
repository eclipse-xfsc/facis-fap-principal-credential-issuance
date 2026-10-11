@identity @mutation
Feature: Fresh tenant authentication without a captured browser session
  Background:
    Given a dedicated synthetic UX tenant is explicitly enabled

  Scenario Outline: Fresh authentication reaches the correct tenant
    Given the fresh login case "<case>" in an empty browser context
    When I authenticate using that identity provider
    Then the fresh session belongs to its expected tenant and subject
    And that principal can start its configured issuance journey
    Examples:
      | case |
      | keycloak |
      | entra |

  Scenario: First login changes the temporary password and enrolls MFA
    Given the fresh login case "firstLogin" in an empty browser context
    When I authenticate using that identity provider
    Then password change and MFA enrollment were required and completed
    And the fresh session belongs to its expected tenant and subject

  Scenario: Passkey enrollment and subsequent fresh authentication
    Given the fresh login case "passkey" in an empty browser context
    When I authenticate using that identity provider
    Then a passkey was created by the browser authenticator
    And the fresh session belongs to its expected tenant and subject

  Scenario: Participant administrator configures its own identity provider
    Given a signed-in "alphaAdmin" browser session
    When I configure the synthetic tenant identity provider in the UI
    Then its public settings omit the client secret
