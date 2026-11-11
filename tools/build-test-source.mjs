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
import fs from 'node:fs/promises';
const z = 'pci-test-source-v1', fn = 'pci-test-source-records';
const flows = [
  {
    id: z,
    type: 'tab',
    label: 'PCI participant test records',
    disabled: false,
    info: 'Synthetic record source for the Go/Goa participant repository. This flow does not replace OCM signing, issuance, identity or status services. Configure PCI_TEST_SOURCE_TOKEN and PCI_TEST_SOURCE_RECORDS through runtime Secrets.'
  },
  {
    id: 'pci-test-source-notes',
    type: 'comment',
    z,
    name: 'Synthetic records — participant-owned test fixture',
    info: 'Import into the separate Internet-reachable datasource ORCE. POST <ORCE base>/participant-test/v1/records uses server-to-server bearer authentication. No debug nodes or token/claim logging.',
    x: 330,
    y: 60,
    wires: []
  },
  {
    id: 'pci-test-source-http',
    type: 'http in',
    z,
    name: 'Authenticated record lookup',
    url: '/participant-test/v1/records',
    method: 'post',
    upload: false,
    swaggerDoc: '',
    x: 180,
    y: 140,
    wires: [[fn]]
  },
  {
    id: fn,
    type: 'function',
    z,
    name: 'Tenant/configuration/subject record lookup',
    func: await fs.readFile('reference/participant-data-source/records.js', 'utf8'),
    outputs: 1,
    timeout: '5',
    noerr: 0,
    initialize: '',
    finalize: '',
    libs: [{ var: 'crypto', module: 'crypto' }],
    x: 470,
    y: 140,
    wires: [['pci-test-source-response']]
  },
  {
    id: 'pci-test-source-response',
    type: 'http response',
    z,
    name: 'No-store JSON response',
    statusCode: '',
    headers: {},
    x: 770,
    y: 140,
    wires: []
  }
];
await fs.writeFile('reference/participant-data-source/flows.json', JSON.stringify(flows, null, 2) + '\n');
