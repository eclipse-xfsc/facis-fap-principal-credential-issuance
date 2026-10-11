@runtime
Feature: Deployed PCI runtime and tenant boundary
  Background:
    Given the PCI environment is configured

  Scenario: Dependencies are ready
    When I request the readiness endpoint
    Then the deployed runtime is ready

  Scenario: Invalid deployment arguments fail early
    When I run G0 with an invalid argument
    Then G0 rejects the argument before deployment

  Scenario: Delegated administrator uses the real workspace
    Given a signed-in "alphaAdmin" browser session
    Then the issuer workspace is usable
    When the Alpha session requests Beta issuer administration
    Then access is denied without returning Beta data

  Scenario: Principal cannot create configurations
    Given a signed-in "alphaPrincipal" browser session
    Then an ordinary principal cannot administer configurations

  Scenario: Envoy overwrites forged tenant headers
    Then the public issuer metadata belongs to Alpha
