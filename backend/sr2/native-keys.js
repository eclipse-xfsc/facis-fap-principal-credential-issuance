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
// Public-key normalization and proof verification, independent of OCM I/O.
import crypto from 'node:crypto';
import { sr2Assert, sr2Fail } from './domain.js';
export function pciHolderProof(token, { nonce, issuer }, now = Date.now()) {
  sr2Assert(typeof token === 'string' && token.length < 16384, 'A wallet JWT proof is required.');
  const parts = token.split('.');
  sr2Assert(parts.length === 3 && parts.every(part => /^[A-Za-z0-9_-]+$/.test(part)), 'Malformed wallet proof encoding.');
  let header,
  claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  } catch {
    sr2Fail(400, 'PCI-PROOF-INVALID', 'Malformed wallet proof.');
  }
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  sr2Assert(isObject(header) && isObject(claims) && isObject(header.jwk), 'Wallet proof header, claims and key must be objects.');
  const key = header.jwk,
  alg = header.alg;
  const privateFields = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'];
  sr2Assert(header.typ === 'openid4vci-proof+jwt' && !privateFields.some(field => Object.hasOwn(key, field)) &&
  !Object.hasOwn(header, 'jku') && !Object.hasOwn(header, 'x5u') && !Object.hasOwn(header, 'crit'),
    'An embedded public proof key is required.');
  sr2Assert(['ES256', 'PS256', 'RS256'].includes(alg) && (alg === 'ES256' ? key.kty === 'EC' && key.crv === 'P-256': key.kty === 'RSA') &&
  (key.alg === undefined || key.alg === alg) && (key.use === undefined || key.use === 'sig') && (key.key_ops === undefined ||
  (Array.isArray(key.key_ops) && key.key_ops.length === 1 && key.key_ops[0] === 'verify')), 'Invalid proof key.');
  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key, format: 'jwk' });
  } catch {
    sr2Fail(400, 'PCI-PROOF-INVALID', 'Invalid wallet proof public key.');
  }
  if (key.kty === 'RSA') sr2Assert(publicKey.asymmetricKeyDetails.modulusLength >= 2048, 'Proof RSA key too small.');
  let verified = false;
  try {
    verified = crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), {
      key: publicKey,
      ...(alg === 'ES256' ? { dsaEncoding: 'ieee-p1363' }: {}),
      ...(alg === 'PS256' ? { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }: {}),
    }, Buffer.from(parts[2], 'base64url'));
  } catch {
    sr2Fail(400, 'PCI-PROOF-INVALID', 'Invalid wallet proof signature encoding.');
  }
  sr2Assert(verified, 'Wallet proof signature rejected.');
  sr2Assert(claims.aud === issuer && claims.nonce === nonce && Number.isInteger(claims.iat) && Math.abs(now / 1000 - claims.iat) <= 300,
    'Wallet proof binding rejected.');
  return { jwk: publicKey.export({ format: 'jwk' }) };
}
export function pciNativeSigningKey(input, { key, did, algorithm }) {
  const invalid = () => sr2Fail(502, 'PCI-SIGNER-JWK-INVALID', 'The signer returned an invalid public signing key.');
  if (!['ES256', 'RS256', 'PS256'].includes(algorithm)) invalid();
  let document = input;
  if (typeof document === 'string') {
    try {
      document = JSON.parse(document);
    } catch {
      invalid();
    }
  }
  const keys = Array.isArray(document) ? document: document && Array.isArray(document.keys) ? document.keys: [document];
  if (!keys.length || keys.length > 20) invalid();
  for (const candidate of keys) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !['EC', 'RSA', 'OKP'].includes(candidate.kty)) invalid();
    if (['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some(field => Object.hasOwn(candidate, field))) invalid();
    if (candidate.kid !== undefined && candidate.kid !== key && candidate.kid !== did + '#' + key) invalid();
    if (candidate.use !== undefined && candidate.use !== 'sig') invalid();
    if (candidate.key_ops !== undefined && (!Array.isArray(candidate.key_ops) || candidate.key_ops.length !== 1 ||
    candidate.key_ops[0] !== 'verify')) invalid();
  }
  const selected = keys.filter(candidate => (candidate.alg === undefined || candidate.alg === algorithm) &&
  (algorithm === 'ES256' ? candidate.kty === 'EC' && candidate.crv === 'P-256': candidate.kty === 'RSA'));
  if (selected.length !== 1) invalid();
  try {
    crypto.createPublicKey({ key: selected[0], format: 'jwk' });
  } catch {
    invalid();
  }
  return { ...selected[0], kid: did + '#' + key };
}
