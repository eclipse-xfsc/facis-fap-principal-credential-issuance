import { Sr2Error, sr2Assert, sr2Hash } from './domain.js';

// TSA exposes key names, whereas its signed JWTs identify tenant DID methods.
// Publish the exact identifiers used in JWT headers; verifiers must not need
// fragment stripping or other non-standard key-selection fallbacks.
export function pciPublicJwks(native, did) {
  const invalid = () => { throw new Sr2Error(502, 'PCI-JWKS-INVALID', 'The signer returned an invalid tenant public key set.'); };
  if (!native || !Array.isArray(native.keys) || typeof did !== 'string' || !did.startsWith('did:web:') || did.includes('#')) invalid();
  const seen = new Set();
  const keys = native.keys.map(key => {
    if (!key || typeof key !== 'object' || Array.isArray(key) || typeof key.kid !== 'string' || !['EC', 'RSA', 'OKP'].includes(key.kty)) invalid();
    if (['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some(field => Object.prototype.hasOwnProperty.call(key, field))) invalid();
    const name = key.kid.startsWith(did + '#') ? key.kid.slice(did.length + 1) : key.kid;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) invalid();
    const kid = did + '#' + name;
    if (seen.has(kid)) invalid();
    seen.add(kid);
    return { ...JSON.parse(JSON.stringify(key)), kid };
  });
  return { keys };
}

// The selected issuer profile determines serialization; an incoming wallet
// cannot switch profiles or choose an internal NATS topic/key namespace.
export function pciCredentialRequest(input, profile, configurations) {
  sr2Assert(input && typeof input === 'object' && !Array.isArray(input), 'A credential request object is required.');
  sr2Assert(!input.credential_response_encryption, 'Credential response encryption is not advertised.');
  // HTTP credential requests are JSON documents; host clone globals are not
  // available in the Node-RED Function-node sandbox.
  const result = JSON.parse(JSON.stringify(input));
  if (profile === 'oid4vci-draft13' && !result.credential_identifier) {
    sr2Assert(typeof result.format === 'string', 'Draft 13 requires a credential format.');
    const matches = Object.entries(configurations).filter(([, c]) => {
      if (c.format !== result.format) return false;
      if (result.format.includes('sd-jwt')) return c.vct === result.vct;
      const types = result.credential_definition?.type;
      return Array.isArray(types) && sr2Hash([...types].sort()) === sr2Hash([...(c.credential_definition?.type || [])].sort());
    });
    sr2Assert(matches.length === 1, 'The requested format must identify one configuration.');
    result.credential_configuration_id = matches[0][0];
  }
  sr2Assert(Boolean(result.credential_identifier) !== Boolean(result.credential_configuration_id), 'Select exactly one credential.');
  if (profile === 'oid4vci-draft13') {
    sr2Assert(!result.proofs && result.proof?.proof_type === 'jwt', 'Draft 13 requires a singular JWT proof.');
    result.proofs = { jwt: [result.proof.jwt] };
  } else {
    sr2Assert(!result.proof && !result.format && !result.credential_definition && !result.vct, 'Use the OID4VCI 1.0 request fields.');
  }
  sr2Assert(result.proofs && Object.keys(result.proofs).length === 1 && Array.isArray(result.proofs.jwt) && result.proofs.jwt.length === 1 && typeof result.proofs.jwt[0] === 'string', 'Exactly one JWT proof is supported.');
  return {
    ...(result.credential_identifier ? { credential_identifier: result.credential_identifier } : { credential_configuration_id: result.credential_configuration_id }),
    proofs: result.proofs,
  };
}

export function pciCredentialResponse(response, profile) {
  sr2Assert(response && Array.isArray(response.credentials) && response.credentials.length === 1 && response.credentials[0].credential, 'Invalid native credential response.');
  if (profile === 'oid4vci-draft13') return { credential: response.credentials[0].credential };
  return { credentials: [{ credential: response.credentials[0].credential }] };
}

export function pciWalletMetadata(metadata, profile) {
  // Preserve the native document while emitting the selected wallet profile.
  const result = JSON.parse(JSON.stringify(metadata));
  for (const configuration of Object.values(result.credential_configurations_supported || {})) {
    delete configuration.topic;
    delete configuration.schema;
    if (profile !== 'oid4vci-draft13') continue;
    const details = configuration.credential_metadata || {};
    if (details.display) configuration.display = details.display;
    const sd=configuration.format.includes('sd-jwt');
    const claims = Object.fromEntries((details.claims || []).filter(c => sd?c.path?.length===1:[2,3].includes(c.path?.length)&&c.path[0]==='credentialSubject').map(c => [c.path.at(-1), { mandatory: c.mandatory, display: c.display }]));
    if (configuration.format.includes('sd-jwt')) configuration.claims = claims;
    else if (configuration.credential_definition) configuration.credential_definition.credentialSubject = configuration.format==='ldp_vc'?{pciClaims:claims}:claims;
    delete configuration.credential_metadata;
  }
  if (profile === 'oid4vci-draft13') delete result.nonce_endpoint;
  return result;
}
