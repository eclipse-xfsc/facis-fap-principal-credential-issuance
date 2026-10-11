@registration @mutation
Feature: Registration, email verification and provider decisions
  Background:
    Given a dedicated synthetic UX tenant is explicitly enabled
    And a signed-in "provider" browser session

  Scenario: Approval requires email verification and deletion removes the tenant
    When I submit a new registration through the public form
    Then provider approval is refused before email verification
    When I follow its Mailpit verification link
    Then the email verification token cannot be reused
    When the provider approves the verified registration
    Then the new tenant becomes ready
    When the provider deletes that test tenant by its exact slug
    Then the tenant route and public DID are unavailable

  Scenario: A rejected registration creates no tenant
    When I submit a new registration through the public form
    And I follow its Mailpit verification link
    And the provider rejects the verified registration
    Then no tenant exists for that registration
    And the rejection email is delivered to that registrant
