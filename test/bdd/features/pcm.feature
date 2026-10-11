@pcm @mutation
Feature: Actual PCM display for two tenants and two principal cohorts
  Background:
    Given a dedicated synthetic UX tenant is explicitly enabled

  Scenario Outline: PCM imports the correct credential and renders its branding
    Given the prepared native case "<case>"
    When I complete its real issuance journey
    And the dedicated PCM device imports that offer
    Then PCM shows the expected principal issuer and branding within the screen
    And native history confirms issuance for that principal
    Examples:
      | case |
      | pcm-alpha-first |
      | pcm-alpha-second |
      | pcm-beta-first |
      | pcm-beta-second |

  Scenario: Published configuration modifications reach the real wallet display
    Given the prepared native case "pcm-modification"
    When I modify the prepared published configuration and its logo in the UI
    Then wallet discovery exposes the changed name description and logo
    When I complete its real issuance journey
    And the dedicated PCM device imports that offer
    Then PCM shows the expected principal issuer and branding within the screen
    And native history confirms issuance for that principal
