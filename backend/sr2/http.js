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
// ORCE transport wrapper. Uses _common.js helpers, inlined only in SR2 tabs.
// handleSr2 runs the checks in a fixed order: transport and action, authority
// headers, same-site rules for writes, body size, then the principal for the
// route family (internal service, provider lifecycle, tenant session), then the
// operation itself. Each step is its own function; the order is the contract.
const SR2_AUTHORITY_HEADERS = [
  'host',
  'x-forwarded-host',
  'x-pci-tenant-id',
  'x-pci-tenant-slug',
  'x-pci-tenant-domain',
  'authorization',
  'cookie',
  'origin',
  'x-pci-public-request'
];
const SR2_OBSERVED_ACTIONS = ['issuance.offer', 'history.revoke', 'publication.publish'];
const SR2_RESOURCE_KINDS = {
  config: 'configuration',
  flow: 'flow',
  metadata: 'metadata',
  branding: 'branding',
  connector: 'connector',
  asset: 'asset',
  settings: 'settings'
};
function sr2Action(allowedActions) {
  if (msg.pciTransport !== 'http' && !(msg.pciTransport === 'uibuilder' && msg.pciBridgeApproved === true)) throw new Sr2Error(400,
    'PCI-SR2-TRANSPORT', 'Use the authenticated browser bridge or HTTP API.');
  const action = String(msg.pciAction || '');
  if (!allowedActions.includes(action)) throw new Sr2Error(404, 'PCI-SR2-NOT-FOUND', 'Unknown operation.');
  return action;
}
// Authority headers may appear once and only as strings; a repeated or
// structured header is a tenant-context attack, not a malformed request.
function sr2CheckAuthorityHeaders(headers) {
  const raw = msg.req?.rawHeaders || [],
  names = new Set();
  for (let i = 0; i < raw.length; i += 2) {
    const key = String(raw[i]).toLowerCase();
    if (SR2_AUTHORITY_HEADERS.includes(key)) {
      if (names.has(key)) throw pciErrors.invalidTenantContext();
      names.add(key);
    }
  }
  for (const key of SR2_AUTHORITY_HEADERS) if (headers[key] !== undefined && typeof headers[key] !== 'string') throw pciErrors
    .invalidTenantContext();
}
function sr2CheckWriteRequest(headers, host) {
  const method = String(msg.req.method || 'GET').toUpperCase();
  if (['GET', 'HEAD'].includes(method)) return;
  if (headers.origin && headers.origin !== `https://${host}`) throw pciErrors.forbidden();
  if (headers['sec-fetch-site'] === 'cross-site') throw pciErrors.forbidden();
  if (String(headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw pciErrors.validation(
    'Use application/json.');
}
function sr2Input() {
  const input = parseBody();
  if (Buffer.byteLength(JSON.stringify(input)) > 1500000) throw new Sr2Error(413, 'PCI-SR2-SIZE', 'Request is too large.');
  return input;
}
function sr2IfMatch(headers) {
  const tag = String(headers['if-match'] || '');
  const value = /^"[1-9][0-9]*"$/.test(tag) ? Number(tag.slice(1, - 1)): NaN;
  return Number.isSafeInteger(value) ? value: undefined;
}
// Internal routes: service token from an allowed address, never a request
// marked public. The adapter authenticates principal/service claims against
// the selected upstream contract; browser bodies can never supply authority.
function sr2CheckInternalCaller(headers) {
  const remote = String(msg.req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const supplied = bearerToken(),
  expected = cfg.internalServiceToken,
  a = Buffer.from(supplied),
  b = Buffer.from(expected);
  if (headers['x-pci-public-request'] || !envList('PCI_INTERNAL_ALLOWED_IPS', []).includes(remote) ||
  !expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw pciErrors.unauthorized();
}
async function sr2InternalPrincipal(request) {
  const { action, headers, input, tenantId, service, adapters } = request;
  sr2CheckInternalCaller(headers);
  if (action === 'internal.callback') {
    const invocation = await adapters.authenticateCallback({ input, tenantId });
    const result = await service.complete(invocation.principal, invocation.requestId, invocation.participantJwt, invocation.holderBinding);
    return { response: emit(200, result, { 'cache-control': 'no-store' }) };
  }
  const invocation = await adapters.authenticateInvocation({ input, tenantId, action });
  return { principal: invocation.principal };
}
async function sr2ProviderPrincipal(request) {
  if (request.host !== cfg.mainHost) throw pciErrors.forbidden();
  const s = await requireSession(['provider_admin']);
  return { principal: { ...s, tenantId: request.tenantId, provider: true, host: request.host } };
}
// Tenant routes: the routed host, the gateway's tenant headers and the path
// must all name the same tenant; public routes answer without a session.
async function sr2TenantPrincipal(request) {
  const { action, headers, host, route, pool, service } = request;
  const tenant = (await pool.query("SELECT * FROM tenants WHERE primary_domain=$1 AND state NOT IN ('deleted','deleting')", [host])
    ).rows[0];
  if (!tenant || (request.tenantId && request.tenantId !== tenant.tenant_id) || String(headers['x-pci-tenant-id'] ||
  '') !== tenant.tenant_id || String(headers['x-pci-tenant-slug'] || '') !== tenant.tenant_slug || normalizeHost(
    headers['x-pci-tenant-domain']) !== host) throw pciErrors.notFound();
  const tenantId = tenant.tenant_id;
  if (action === 'public.asset') {
    const result = await service.asset({ tenantId, host }, route.assetId, true);
    return {
      response: emit(200, result.bytes, {
        'content-type': result.mediaType,
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'cache-control': 'public, max-age=86400',
        etag: `"${result.hash}"`
      })
    };
  }
  if (action === 'public.branding') return { response: emit(200, await service.branding(tenantId), { 'cache-control': 'no-cache' }) };
  const session = await requireSession([], tenantId);
  if (session.tenantId !== tenantId) throw pciErrors.forbidden();
  return { principal: { ...session, host }, tenantId };
}
function sr2Principal(request) {
  if (request.action.startsWith('internal.')) return sr2InternalPrincipal(request);
  if (request.action.startsWith('provider.lifecycle')) return sr2ProviderPrincipal(request);
  return sr2TenantPrincipal(request);
}
// Versioned resources (configurations, flows, metadata, branding, connectors,
// assets, settings) share one service entry point; the verb is the route's.
async function sr2ResourceOperation(request, group, verb) {
  const { p, route, input, service, match } = request;
  const kind = SR2_RESOURCE_KINDS[group],
  id = route.configurationId || route.flowId || route.connectorId || route.assetId || request.tenantId;
  if (verb === 'list') return { result: await service.list(p, kind) };
  if (group === 'asset' && verb === 'get') {
    const a = await service.asset(p, id);
    return {
      response: emit(200, a.bytes, { 'content-type': a.mediaType, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' })
    };
  }
  const result = await service.resource(p, kind, verb, verb === 'create' ? null: id, input, match);
  return { result, status: verb === 'create' ? 201: 200 };
}
async function sr2IssuerOperation(request, action) {
  const { p, input, service, adapters } = request;
  if (action === 'issuer.key-create') {
    await service.store.transaction(p.tenantId, tx => service.authorize(tx, p, 'admin'));
    sr2Object(input, ['name', 'type']);
    return { result: await adapters.key(p.tenantId, input.name, input.type) };
  }
  if (action === 'issuer.capabilities') return { result: await service.capabilities(p) };
  if (action === 'publication.get' || action === 'internal.publication-status') return { result: await service.publication(p) };
  if (action === 'publication.publish' || action === 'internal.metadata-publish') return { result: await service.publication(p, true) };
  if (action === 'semantic.export') return { result: await service.semanticTemplate(p, request.route.configurationId) };
  return null;
}
async function sr2PresentationOperation(request, action) {
  const { p, input, route, service } = request;
  if (action === 'presentation.configurations') return { result: await service.presentationConfigurations(p) };
  if (action === 'presentation.start') return { result: await service.presentationStart(p, input), status: 201 };
  if (action === 'presentation.result') {
    sr2Object(input, ['responseCode']);
    return { result: await service.presentationResult(p, route.requestId, input.responseCode) };
  }
  return null;
}
async function sr2IssuanceOperation(request, action) {
  const { p, input, route, headers, service } = request;
  if (action === 'issuance.eligible') return { result: await service.eligible(p) };
  if (action === 'issuance.start' || action === 'internal.offer-create') {
    sr2Object(input, ['configurationId']);
    return {
      result: await service.start(p, input.configurationId, String(headers['idempotency-key'] || '')),
      status: 201
    };
  }
  if (action === 'issuance.get' || action === 'internal.offer-get') return { result: await service.request(p, route.requestId) };
  if (action === 'issuance.advance') return { result: await service.advance(p, route.requestId, input) };
  if (action === 'issuance.offer') {
    await pciListen();
    const progress = msg.pciTransport === 'uibuilder' ? (stage, label) => pciBridgeProgress(stage, label): undefined;
    return { result: await service.offer(p, route.requestId, progress) };
  }
  return null;
}
async function sr2HistoryOperation(request, action) {
  const { p, input, route, service } = request;
  if (action === 'history.list') return { result: await service.history(p, route.configurationId, query()) };
  if (action === 'history.revoke') {
    sr2Object(input, ['requestId', 'confirmed']);
    return { result: await service.revoke(p, route.configurationId, input.requestId, input.confirmed) };
  }
  if (action === 'history.unblock') {
    sr2Object(input, ['subjectHash']);
    return { result: await service.unblock(p, route.configurationId, input.subjectHash) };
  }
  return null;
}
async function sr2LifecycleOperation(request, action) {
  const { p, input, service, match } = request;
  if (action.endsWith('.lifecycle')) {
    sr2Object(input, ['state', 'confirmation']);
    return { result: await service.lifecycle(p, input.state, input.confirmation), status: 202 };
  }
  if (action === 'internal.plugin-put') return {
    result: await service.resource(p, 'settings', input.create ? 'create': 'update', request.tenantId, { data: input.data }, match)
  };
  if (action === 'internal.plugin-delete') throw new Sr2Error(409, 'PCI-SR2-RETIREMENT-BLOCKED',
    'Upstream plugin retirement contract is required.');
  return null;
}
// Dispatch by route family. The first family that recognises the action
// answers; an action no family recognises is a 404, as before.
async function sr2Operation(request, action) {
  const [group, verb] = action.split('.');
  if (SR2_RESOURCE_KINDS[group]) return sr2ResourceOperation(request, group, verb);
  if (group === 'assignment') return {
    result: await request.service.assignments(request.p, verb, request.route.assignmentId, request.input)
  };
  for (const family of [
    sr2IssuerOperation,
    sr2PresentationOperation,
    sr2IssuanceOperation,
    sr2HistoryOperation,
    sr2LifecycleOperation
  ]) {
    const outcome = await family(request, action);
    if (outcome) return outcome;
  }
  throw pciErrors.notFound();
}
function sr2ErrorResponse(error, started) {
  if (SR2_OBSERVED_ACTIONS.includes(msg.pciAction)) pciObserve(msg.pciAction.replace('.', '_'), 'error', started);
  if (sr2IsError(error)) return emitError(Object.assign(new PciError(error.status, error.code, error.status < 500 ? 'Check the request':
    'Service operation failed', error.message, [429, 502, 503, 504].includes(error.status)), error.fields ? { fields: error.fields }: {}));
  return emitError(error);
}
async function handleSr2(allowedActions) {
  const started = Date.now();
  try {
    const action = sr2Action(allowedActions);
    const headers = requestHeaders();
    sr2CheckAuthorityHeaders(headers);
    const host = routedHost();
    sr2CheckWriteRequest(headers, host);
    const input = sr2Input();
    const pool = getPool(),
    { service, adapters } = pciRuntime();
    const route = params();
    const request = {
      action,
      headers,
      host,
      input,
      route,
      pool,
      service,
      adapters,
      tenantId: route.tenantId ? sr2Uuid(route.tenantId): null
    };
    const resolved = await sr2Principal(request);
    if (resolved.response) return resolved.response;
    request.p = resolved.principal;
    if (resolved.tenantId) request.tenantId = resolved.tenantId;
    if (msg.pciTransport === 'uibuilder') pciBridgeProgress('processing', 'Processing request');
    request.match = sr2IfMatch(headers);
    const outcome = await sr2Operation(request, action);
    if (outcome.response) return outcome.response;
    if (SR2_OBSERVED_ACTIONS.includes(action)) pciObserve(action.replace('.', '_'), 'ok', started);
    return emit(outcome.status || 200, outcome.result, {
      'cache-control': 'no-store',
      ...(outcome.result?.item?.version ? { etag: `"${outcome.result.item.version}"` }: {})
    });
  } catch (error) {
    return sr2ErrorResponse(error, started);
  }
}
async function handleSr2Maintenance() {
  if (msg.pciTransport !== 'internal' || msg.pciInternal !== true) return null;
  try {
    pciRuntime().service.presentationPrune();
    await pciListen();
    const pool = getPool(),
    { service } = pciRuntime();
    let cursor = '00000000-0000-0000-0000-000000000000',
    count = 0;
    for (;;) {
      const rows = (await pool.query("SELECT tenant_id FROM tenants WHERE tenant_id>$1 AND state<>'deleted' ORDER BY tenant_id LIMIT 50",
        [cursor])).rows;
      if (!rows.length) break;
      for (const t of rows) {
        await service.maintenance(t.tenant_id);
        cursor = t.tenant_id;
        count++;
      }
    }
    node.status({ fill: 'green', shape: 'dot', text: `${count} tenant(s); native adapter connected` });
  } catch {
    node.status({ fill: 'red', shape: 'ring', text: 'PCI-SR2-MAINTENANCE-FAILED' });
  }
  return null;
}
