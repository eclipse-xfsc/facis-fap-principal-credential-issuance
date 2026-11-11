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
import { createPciNativeAdapters } from './native.js';
import { sr2Fail } from './domain.js';
// Compatibility exports retain the public module API while keeping native dependencies acyclic.
export {
  sr2CommonRequest,
  sr2VerifyJwt,
  sr2VerifyCredential,
  sr2Deadline,
  sr2Retry
} from './adapter-contracts.js';
// Unconfigured production adapters remain fail-closed.
export function createSr2Adapters(options) {
  if (options) return createPciNativeAdapters(options);
  const blocked = async() => sr2Fail(503, 'PCI-SR2-CONTRACT-BLOCKED', 'The native adapter is not configured.');
  return {
    capabilities: () => ({
      ready: false,
      code: 'PCI-SR2-CONTRACT-BLOCKED',
      missing: ['OCM service URLs and NATS transport', 'Participant trust material and token provider']
    }),
    assertReady: blocked,
    publishMetadata: blocked,
    createOffer: blocked,
    authenticateInvocation: blocked,
    authenticateCallback: blocked,
    notifyParticipant: blocked,
    getParticipantData: blocked,
    allocateStatus: blocked,
    sign: blocked,
    verifySigned: blocked,
    verifyStatus: blocked,
    revokeStatus: blocked,
    revocationStatus: blocked,
    participantIdentity: blocked,
    signingContext: blocked
  };
}
