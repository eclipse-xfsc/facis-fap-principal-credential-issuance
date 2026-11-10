import { createPciOperationRunner } from './operation-runner.js';
import { createPciIssuerClient } from './client.js';
import { createPciIssuerState } from './workspace-state.js';
import { createPciIssuerSelectors } from './workspace-selectors.js';
import { createPciIdentityActions } from './actions/identity.js';
import { createPciConfigurationActions } from './actions/configurations.js';
import { createPciFlowActions } from './actions/flows.js';
import { createPciTenantActions } from './actions/tenant.js';
import { createPciConnectorActions } from './actions/connectors.js';
import { createPciAccessActions } from './actions/access.js';
import { createPciAssetActions } from './actions/assets.js';
import { createPciHistoryActions } from './actions/history.js';
import { createPciPresentationActions } from './actions/presentation.js';
import { createPciJourneyActions } from './actions/journey.js';
import { createPciRefreshActions } from './actions/refresh.js';
/**
 * Compose issuer features. Browser, transport and Vue APIs are supplied explicitly.
 * A caller can replace those boundaries in tests without changing domain modules.
 */
export function createPciIssuerController(props, dependencies) {
  const { window, runtime, ref, computed, request, normalizeUiError, api, pciQrImage } = dependencies;
  const state = createPciIssuerState({ ref, props, runtime, window });
  const projections = createPciIssuerSelectors(state, { computed, pciQrImage });
  const call = createPciIssuerClient(request, () => props.tenant.tenantId);
  let journeyActions;
  const run = createPciOperationRunner(state, normalizeUiError, () => journeyActions.restoreJourney());
  const context = {
    ...dependencies,
    ...projections,
    props,
    call,
    run,
    clone: value => JSON.parse(JSON.stringify(value))
  };
  const identityActions = createPciIdentityActions(state, context);
  const presentationActions = createPciPresentationActions(state, context);
  journeyActions = createPciJourneyActions(state, context);
  const refreshActions = createPciRefreshActions(state, {
    ...context,
    loadIdentity: identityActions.loadIdentity,
    restoreJourney: journeyActions.restoreJourney,
    rememberWorkspace: journeyActions.rememberWorkspace,
    recovery: journeyActions.recovery
  });
  return {
    ...state,
    ...projections,
    ...identityActions,
    ...presentationActions,
    ...createPciConfigurationActions(state, context),
    ...createPciFlowActions(state, context),
    ...createPciTenantActions(state, context),
    ...createPciConnectorActions(state, context),
    ...createPciAccessActions(state, context),
    ...createPciAssetActions(state, context),
    ...createPciHistoryActions(state, context),
    ...journeyActions,
    ...refreshActions
  };
}
