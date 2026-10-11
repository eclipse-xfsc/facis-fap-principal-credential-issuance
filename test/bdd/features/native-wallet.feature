@native @mutation
Feature: Native issuance and presentation on prepared synthetic configurations
  Background:
    Given a dedicated synthetic UX tenant is explicitly enabled

  Scenario Outline: Native issuance with both presentation protocols
    Given the prepared native case "<case>"
    When I complete its real issuance journey
    And the software wallet consumes its offer and presents the credential
    Then native issuance and both presentation protocols pass
    And its history identifies the principal and holder
    When the administrator revokes that credential
    Then reissuance is refused until an audited unblock
    Examples:
      | case |
      | draft13-internal |
      | draft13-participant |
      | final-internal |
      | final-participant |

  Scenario Outline: Advertised non-JWT formats through both signing paths
    Given the prepared native case "<case>"
    When I complete its real issuance journey
    And the software wallet consumes and verifies the advertised credential format
    Then that native format is issued and cryptographically verified
    And its history identifies the principal and holder
    When the administrator revokes that credential
    Then reissuance is refused until an audited unblock
    Examples:
      | case |
      | draft13-sd-internal |
      | draft13-sd-participant |
      | final-sd-internal |
      | final-sd-participant |
      | draft13-ldp-internal |
      | draft13-ldp-participant |
      | final-ldp-internal |
      | final-ldp-participant |

  Scenario: Archiving a published configuration preserves an issued credential
    Given the prepared native case "archive-published"
    When I complete its real issuance journey
    And the software wallet verifies its issued credential after archiving the configuration
    Then native issuance and both presentation protocols pass
