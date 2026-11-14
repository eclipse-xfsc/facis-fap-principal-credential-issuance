// Pure issuer-catalogue mapping. No transport, database or runtime state.
import { pciLdpContext } from './linked-data.js';
import { sr2Fail } from './domain.js';
export function pciContains(expected, actual) {
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((v, i) => pciContains(v,
    actual[i]));
  if (expected && typeof expected === 'object') return Boolean(actual && typeof actual === 'object' &&
  Object.entries(expected).every(([k, v]) => Object.hasOwn(actual, k) && pciContains(v, actual[k])));
  return expected === actual;
}
export function pciIssuanceTopic(tenantId, configurationId) {
  return 'fap.pci.' + tenantId + '.' + configurationId;
}
export function pciCompleteClaimDisplay(expected, native) {
  if (!native || typeof native !== 'object' || Array.isArray(native)) return native;
  // Native replies and local metadata are JSON documents, not host objects.
  const completed = JSON.parse(JSON.stringify(native));
  for (const [id, configuration] of Object.entries(expected.credential_configurations_supported || {})) {
    const wanted = configuration.credential_metadata?.claims;
    const observed = completed.credential_configurations_supported?.[id]?.credential_metadata?.claims;
    if (!Array.isArray(wanted) || !Array.isArray(observed) || wanted.length !== observed.length) continue;
    for (let i = 0; i < wanted.length; i++) {
      const { display, ...definition } = wanted[i];
      if (display !== undefined && pciContains(definition, observed[i]) && !Object.hasOwn(observed[i], 'display')) observed[i].display =
        JSON.parse(JSON.stringify(display));
    }
  }
  return completed;
}
export function pciNativeMetadata(bundle, assetUrl) {
  const m = bundle.issuer,
  base = m.issuer,
  configs = {};
  for (const { id, data: c } of bundle.configurations) {
    const display = {
      name: c.name,
      description: c.description,
      locale: 'en',
      ...(c.logoAssetId ? { logo: { uri: assetUrl(bundle.tenantId, c.logoAssetId), alt_text: c.name } }: {}),
      ...(c.backgroundAssetId ? { background_image: { uri: assetUrl(bundle.tenantId, c.backgroundAssetId) } }: {})
    };
    configs[c.identifier] = {
      format: c.format,
      scope: c.identifier,
      cryptographic_binding_methods_supported: ['jwk'],
      credential_signing_alg_values_supported: c.format === 'ldp_vc' ? ['JsonWebSignature2020']: c.format === 'jwt_vc_json' ?
        ['ES256', 'PS256', 'RS256']: ['ES256'],
      proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['ES256', 'PS256', 'RS256'] } },
      topic: pciIssuanceTopic(bundle.tenantId, id),
      schema: {
        type: 'object',
        properties: Object.fromEntries(c.claims.map(x => [x.name, { type: x.type }])),
        required: c.claims.filter(x => x.required).map(x => x.name),
        additionalProperties: false
      },
      credential_metadata: {
        display: [display],
        claims: c.claims.map(x => ({
          path: c.format.includes('sd-jwt') ? [x.name]: c.format === 'ldp_vc' ? ['credentialSubject', 'pciClaims', x.name]:
            ['credentialSubject', x.name],
          mandatory: x.required,
          display: [{ name: x.name, locale: 'en' }]
        }))
      },
      ...(c.format.includes('sd-jwt') ? { vct: c.vct }: {
        credential_definition: {
          type: c.credentialTypes,
          '@context': c.format === 'ldp_vc' ? pciLdpContext(c, base): ['https://www.w3.org/2018/credentials/v1']
        }
      })
    };
  }
  return {
    credential_issuer: base,
    authorization_servers: m.authorizationServers,
    credential_endpoint: base + '/api/credential',
    nonce_endpoint: base + '/api/nonce',
    display: [{ name: m.displayName, locale: 'en' }],
    credential_configurations_supported: configs
  };
}
export function pciPublicCatalogue(bundle, native) {
  const expected = pciNativeMetadata(bundle, (_, id) => bundle.issuer.issuer + '/api/v1/public/assets/' + id);
  if (!bundle.configurations.length) return expected;
  for (const c of Object.values(expected.credential_configurations_supported)) {
    delete c.topic;
    delete c.schema;
  }
  const filtered = pciCompleteClaimDisplay(expected, {
    ...native,
    credential_configurations_supported: Object.fromEntries(Object.entries(native?.credential_configurations_supported ||
    {}).filter(([id]) => Object.hasOwn(expected.credential_configurations_supported, id)))
  });
  if (!pciContains(expected, filtered)) sr2Fail(503, 'PCI-METADATA-PENDING',
    'Publish the current issuer catalogue to OCM before wallet discovery.');
  return filtered;
}
