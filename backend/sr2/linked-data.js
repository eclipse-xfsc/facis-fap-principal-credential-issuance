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
// One vocabulary and shape for metadata, signing and semantic exports.
export function pciLdpVocabulary(configuration, origin) {
  return origin.replace(/\/$/, '') + '/.well-known/pci-vocabulary/' + encodeURIComponent(configuration.identifier) + '#';
}
export function pciLdpSubject(subject) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/.test(subject) ? subject: 'urn:xfsc:pci:subject:' + encodeURIComponent(subject);
}
export function pciLdpContext(configuration, origin) {
  const vocabulary = pciLdpVocabulary(configuration, origin),
  status = 'https://w3id.org/vc/status-list#';
  // Property scope permits claims called "type" or "issuer" without changing
  // the protected VC envelope. Inline status terms avoid mutable remote loads.
  const terms = {
    pciClaims: {
      '@id': vocabulary + 'claims',
      '@context': Object.fromEntries(configuration.claims.map(x => [x.name, vocabulary + encodeURIComponent(x.name)]))
    },
    StatusList2021Entry: {
      '@id': status + 'StatusList2021Entry',
      '@context': {
        '@protected': true,
        id: '@id',
        type: '@type',
        statusPurpose: status + 'statusPurpose',
        statusListIndex: status + 'statusListIndex',
        statusListCredential: { '@id': status + 'statusListCredential', '@type': '@id' }
      }
    }
  };
  for (const type of configuration.credentialTypes) if (type !== 'VerifiableCredential' && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(
    type)) terms[type] = vocabulary + encodeURIComponent(type);
  return [
    'https://www.w3.org/2018/credentials/v1',
    'https://w3id.org/security/suites/jws-2020/v1',
    terms
  ];
}
