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
// Pure factories return fresh nested state for each editing session.
export function newPciConnectorForm() {
  return {
    name: '',
    endpoint: '',
    serverName: '',
    protocolVersion: 'participant-v1',
    tlsSecret: { name: '' },
    trustSecret: { name: '' },
    jwtIssuer: '',
    jwtAudience: '',
    jwtScopes: ['credential:issue'],
    signingModes: ['internal-signing'],
    timeoutMs: 5000,
    attempts: 1,
    ratePerMinute: 10,
    circuitFailureThreshold: 3,
    circuitCooldownMs: 30000,
    configurationIds: []
  };
}
export function newPciConfigurationForm() {
  return {
    identifier: '',
    name: '',
    description: '',
    profile: 'oid4vci-1.0',
    format: 'jwt_vc_json',
    credentialTypes: ['VerifiableCredential', 'EmployeeCredential'],
    vct: null,
    claims: [{ name: 'name', type: 'string', required: true }],
    logoAssetId: null,
    backgroundAssetId: null,
    flowId: null,
    connectorId: null,
    signingMode: 'internal-signing',
    keyRef: '',
    statusProfile: 'status-list',
    eligibility: { subjects: [], roles: ['principal'], entitlements: [] },
    ratePerMinute: 10,
    blockReissuance: true
  };
}
