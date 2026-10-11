import test from 'node:test';
import assert from 'node:assert/strict';
import { pciCredentialRequest, pciCredentialResponse, pciWalletMetadata } from '../../../backend/sr2/profiles.js';

const definitions = { Employee: { format: 'jwt_vc_json', credential_definition: { type: ['VerifiableCredential', 'Employee'] } } };
test('Draft 13 format selection and singular proof become a native 1.0 request', () => {
  const input = { format: 'jwt_vc_json', credential_definition: { type: ['Employee', 'VerifiableCredential'] }, proof: { proof_type: 'jwt', jwt: 'signed-proof' } };
  assert.deepEqual(pciCredentialRequest(input, 'oid4vci-draft13', definitions), { credential_configuration_id: 'Employee', proofs: { jwt: ['signed-proof'] } });
  assert.equal(input.proofs, undefined);
  assert.throws(() => pciCredentialRequest(input, 'oid4vci-draft13', { ...definitions, Duplicate: definitions.Employee }));
  assert.throws(() => pciCredentialRequest(input, 'oid4vci-1.0', definitions));
});
test('1.0 preserves the identifier choice and rejects multiple proofs, selection and unadvertised encryption', () => {
  const input = { credential_identifier: 'authorized-dataset', proofs: { jwt: ['proof'] } };
  assert.deepEqual(pciCredentialRequest(input, 'oid4vci-1.0', definitions), input);
  for (const change of [{ credential_configuration_id: 'Employee' }, { proofs: { jwt: ['a', 'b'] } }, { credential_response_encryption: { jwk: {} } }]) {
    assert.throws(() => pciCredentialRequest({ ...input, ...change }, 'oid4vci-1.0', definitions));
  }
});
test('the selected profile controls credential and display serialization', () => {
  const response = { credentials: [{ credential: 'signed-credential' }] };
  assert.deepEqual(pciCredentialResponse(response, 'oid4vci-draft13'), { credential: 'signed-credential' });
  assert.deepEqual(pciCredentialResponse(response, 'oid4vci-1.0'), response);
  assert.throws(() => pciCredentialResponse({ credentials: [] }, 'oid4vci-1.0'));
  const metadata = { nonce_endpoint: 'https://issuer.example/nonce', credential_configurations_supported: { Employee: { ...definitions.Employee, topic: 'private.subject', schema: {}, credential_metadata: { display: [{ name: 'Employee' }], claims: [{ path: ['credentialSubject','name'], mandatory: true, display: [{ name: 'Name' }] }] } } } };
  for (const profile of ['oid4vci-draft13', 'oid4vci-1.0']) {
    const result = pciWalletMetadata(metadata, profile);
    assert.equal(result.credential_configurations_supported.Employee.topic, undefined);
    assert.equal(result.credential_configurations_supported.Employee.schema, undefined);
  }
  const draft = pciWalletMetadata(metadata, 'oid4vci-draft13');
  assert.equal(draft.nonce_endpoint, undefined);
  assert.equal(draft.credential_configurations_supported.Employee.display[0].name, 'Employee');
  assert.equal(draft.credential_configurations_supported.Employee.credential_definition.credentialSubject.name.mandatory, true);
});
