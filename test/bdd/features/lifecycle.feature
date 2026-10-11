@lifecycle
Feature: Disposable deployment lifecycle
  Background:
    Given a dedicated disposable deployment is explicitly enabled

  Scenario: Automated deploy and upgrade avoid an unnecessary ORCE rollout
    When I deploy and upgrade through the release runner
    Then the second apply does not restart ORCE
    And the deployment runner reports sanitized completion

  @uninstall
  Scenario: Uninstall preserves pre-existing runtimes
    When I uninstall through the release runner
    Then the original ORCE and OCM deployments remain
