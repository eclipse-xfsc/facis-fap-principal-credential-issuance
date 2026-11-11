@ux @mutation
Feature: Real issuer administration through the browser
  Background:
    Given a dedicated synthetic UX tenant is explicitly enabled
    And a signed-in "alphaAdmin" browser session

  @pci-ux
  Scenario: Draft validation errors persist until dismissed
    When I create a synthetic configuration draft in the UI
    And I validate it before assigning its connector and journey
    Then the prerequisite error remains after navigation and refresh
    And I can dismiss the error explicitly

  @pci-ux
  Scenario: Create, reorder, preview and publish a credential journey
    When I create a synthetic configuration draft in the UI
    And I create and reorder its journey in the UI
    Then the saved preview preserves that order
    And the journey publishes as an immutable version

  @pci-ux
  Scenario: Tenant settings tabs work at desktop and narrow widths
    When I open tenant settings at desktop and narrow widths
    Then branding and signing-key panels are usable without horizontal overflow

  @pci-ux
  Scenario: An incomplete connector cannot be activated
    When I save a connector with an invalid protocol version
    Then the connector error is actionable and remains visible

  @pci-ux
  Scenario: An archived draft stops accepting edits
    When I create a synthetic configuration draft in the UI
    And I archive that disposable draft in the UI
    Then the draft is shown as archived


  @pci-ux
  Scenario: Grant and revoke issuer administration through the UI
    When I grant the prepared ordinary principal issuer access in the UI
    Then that principal can administer its assigned configuration
    When I revoke that assignment in the UI
    Then the same principal session immediately loses administration

  @destructive
  Scenario: Participant administrator deletes a disposable tenant
    Given a disposable participant tenant is configured for deletion
    When its participant administrator requests deletion in the UI
    Then the disposable tenant becomes deleted and its participant namespace disappears
