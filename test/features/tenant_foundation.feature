Feature: FAP PCI ORCE tenant foundation

  Scenario: Verified registration is approved before resources are reconciled
    Given a participant submitted a tenant registration
    And the contact email was verified
    When a Keycloak provider administrator approves the registration
    Then a tenant desired state is created
    And ORCE creates the tenant ConfigMap and exact subdomain HTTPRoute
    And the tenant becomes active only after Keycloak, Envoy and DNS conditions are ready

  Scenario: Unverified registration cannot be approved
    Given a participant submitted a tenant registration
    And the contact email has not been verified
    When a Keycloak provider administrator attempts approval
    Then the API responds with PCI-STATE-409-001
    And ORCE creates no tenant Kubernetes resources

  Scenario: Tenant host context cannot be spoofed
    Given tenant alpha owns alpha-pci.example.com
    When a request supplies conflicting X-PCI-Tenant headers
    Then Envoy removes the supplied headers
    And injects the immutable Alpha tenant context
    And ORCE rejects missing or inconsistent trusted tenant headers
