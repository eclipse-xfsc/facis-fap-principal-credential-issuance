// Copyright (c) 2026 LEANEA GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Apache License, Version 2.0 which is available at
// https://www.apache.org/licenses/LICENSE-2.0.
//
// SPDX-License-Identifier: Apache-2.0
//
// Prepared with AI-assisted tools and reviewed by the author.
// Assisted-by: AI
import { newPciConnectorForm } from '../form-defaults.js';
/** Connectors operations with explicit state and I/O dependencies. */
export function createPciConnectorActions(state, dependencies) {
  const { connector, connectorForm, connectors, notice } = state;
  const { run, call, clone } = dependencies;
  async function saveConnector() {
    await run(async() => {
      let r = await call('/participant-connectors' + (connector.value ? '/' + connector.value.id: ''), connector.value ? 'PATCH': 'POST',
        { data: connectorForm.value }, connector.value?.version);
      r = await call('/participant-connectors/' + r.item.id + '/publish', 'POST', {}, r.item.version);
      connector.value = r.item;
      connectors.value = (await call('/participant-connectors')).items;
      notice.value = 'Connector saved. Test a credential request to verify its identity and mTLS configuration.';
    });
  }
  function newConnector() {
    connector.value = null;
    connectorForm.value = newPciConnectorForm();
  }
  function editConnector(c) {
    connector.value = c;
    const draft = clone(c.draft);
    connectorForm.value = {
      ...draft,
      configurationIds: Object.hasOwn(draft, 'configurationIds') ? draft.configurationIds: []
    };
  }
  return { saveConnector, newConnector, editConnector };
}
