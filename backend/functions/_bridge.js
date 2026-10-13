// Browser bridge helpers, inlined by build-flows. Grants live only in this
// ORCE process; neither cookies nor bearer credentials enter a flow message.
function pciBridgeGrants() {
  const state = pciProcessState();
  if (!state.bridgeGrants) state.bridgeGrants = new Map();
  for (const [key, grant] of state.bridgeGrants) {
    if (grant.expiresAt <= Date.now()) state.bridgeGrants.delete(key);
  }
  return state.bridgeGrants;
}

async function pciCreateBridgeGrant() {
  if (msg.pciTransport !== 'http') throw pciErrors.forbidden();
  const headers = requestHeaders(), host = routedHost(), input = parseBody();
  // Bootstrap is intentionally HTTP: the browser supplies its HttpOnly cookie
  // and an Origin that scripts on another site cannot forge.
  if (!host || headers.origin !== publicOrigin(host) || headers['sec-fetch-site'] === 'cross-site' ||
      !String(headers['content-type'] || '').startsWith('application/json')) throw pciErrors.forbidden();
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(input.socketId || '')) throw pciErrors.validation('Reconnect the browser before continuing.');
  const trusted = {};
  for (const key of ['host','x-forwarded-host','x-pci-tenant-id','x-pci-tenant-slug','x-pci-tenant-domain','cookie','authorization','origin']) {
    if (headers[key] !== undefined) {
      if (typeof headers[key] !== 'string') throw pciErrors.invalidTenantContext();
      trusted[key] = headers[key];
    }
  }
  const raw = msg.req?.rawHeaders || [], seen = new Set();
  for (let i = 0; i < raw.length; i += 2) {
    const key = String(raw[i]).toLowerCase();
    if (Object.hasOwn(trusted, key) && seen.has(key)) throw pciErrors.invalidTenantContext();
    seen.add(key);
  }
  if (host !== cfg.mainHost) {
    const tenant = (await getPool().query("SELECT * FROM tenants WHERE primary_domain=$1 AND state IN ('provisioning','active','suspended')", [host])).rows[0];
    if (!tenant || trusted['x-pci-tenant-id'] !== tenant.tenant_id || trusted['x-pci-tenant-slug'] !== tenant.tenant_slug || normalizeHost(trusted['x-pci-tenant-domain']) !== host) throw pciErrors.invalidTenantContext();
  }
  let session = null;
  if (cookieValue('fap_pci_session') || bearerToken()) {
    try { session = await requireSession([]); }
    catch (error) { if (error.status !== 401) throw error; delete trusted.cookie; delete trusted.authorization; }
  }
  const grants = pciBridgeGrants();
  // Replace a previous grant for this socket/session, keeping the map bounded.
  for (const [key, grant] of grants) if (grant.socketId === input.socketId && grant.sessionId === (session?.sessionId || null)) grants.delete(key);
  if (grants.size >= 5000) throw new PciError(429, 'PCI-BRIDGE-CAPACITY', 'Try again shortly', 'Too many browser connections. Try again shortly.', true);
  const token = crypto.randomBytes(32).toString('base64url'), expiresAt = Date.now() + 300000;
  grants.set(crypto.createHash('sha256').update(token).digest('hex'), {
    socketId: input.socketId, host, headers: trusted, sessionId: session?.sessionId || null,
    expiresAt, inFlight: new Set(), recent: new Map(), minute: 0, count: 0,
  });
  return emit(200, { token, expiresAt, sessionId: session?.sessionId || null }, {'cache-control':'no-store'});
}

function pciBridgeRequestHeaders() {
  if (!msg.pciBridgeApproved) return {};
  const grant = pciBridgeGrants().get(msg.pciGrantKey);
  if (!grant || grant.socketId !== msg._socketId) return {};
  return {...grant.headers, ...msg.pciTrustedHeaders};
}

function pciBridgeMessage(envelope) {
  return { _socketId: msg._socketId, payload: { version: 1, action: msg.pciCommandAction || 'request',
    requestId: msg.pciRequestId, sessionId: msg.pciSessionId || null, ...envelope } };
}

function pciBridgeProgress(stage, label, progress = null) {
  if (msg.pciTransport !== 'uibuilder' || !msg.pciBridgeApproved) return;
  node.send([null, pciBridgeMessage({ type: 'event', event: 'jobProgress', data: {
    jobId: msg.pciRequestId, stage, label, progress,
  } })]);
}

function pciBridgeErrors(value) {
  const category = value.fields ? 'field' : value.status >= 502 ? 'integration' : value.status >= 500 ? 'system' : 'action';
  const detail = { category, message: value.detail, code: value.code, reference: value.correlation_id,
    retryable: value.retryable === true, status: value.status };
  return { fields: value.fields || {}, [category]: detail };
}

// Only the root dispatcher calls this, after verifying a process-owned grant.
// Every existing responsibility still performs its own session/role/tenant
// checks. HTTP internal callbacks and file responses never enter this bridge.
async function pciNormalizeCommand(routes) {
  const incoming = msg;
  const command = incoming.payload;
  // showMsgUib=true makes UIBUILDER 7.5 overwrite this value from socket.id.
  const socketId = incoming._uib?._socketId;
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(socketId || '')) return null;
  msg = { _socketId: socketId, _msgid: crypto.randomUUID(), pciTransport: 'uibuilder', pciRequestId: '', pciCommandAction: 'request' };
  try {
    if (!command || command.version !== 1 || command.type !== 'command' || !['request','ping'].includes(command.action) ||
        !/^[A-Za-z0-9_-]{16,100}$/.test(command.requestId || '')) throw pciErrors.validation('Invalid browser command envelope.');
    msg.pciRequestId = command.requestId;
    msg.pciCommandAction = command.action;
    const token = command.meta?.bridgeToken;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) throw pciErrors.unauthorized();
    const key = crypto.createHash('sha256').update(token).digest('hex');
    const grant = pciBridgeGrants().get(key);
    if (!grant || grant.socketId !== socketId) throw pciErrors.unauthorized();
    msg.pciBridgeApproved = true;
    msg.pciGrantKey = key;
    msg.pciSessionId = grant.sessionId;
    msg.pciObservedHost = grant.host;
    msg.pciTrustedHeaders = { 'content-type':'application/json' };
    if (grant.sessionId && (await requireSession([])).sessionId !== grant.sessionId) throw pciErrors.unauthorized();
    if (command.sessionId && command.sessionId !== grant.sessionId) throw pciErrors.unauthorized();
    if (grant.inFlight.has(command.requestId) || grant.recent.has(command.requestId)) throw pciErrors.conflict('This command has already been received. Refresh to check its outcome.');
    const minute = Math.floor(Date.now() / 60000);
    if (grant.minute !== minute) { grant.minute = minute; grant.count = 0; }
    if (++grant.count > 240 || grant.inFlight.size >= 12) throw new PciError(429, 'PCI-BRIDGE-RATE', 'Try again shortly', 'Wait for the current operation to finish.', true);
    if (command.action === 'ping') return emit(200, { pong: true });
    let input = command.payload;
    if (command.meta.chunk) {
      const part = command.meta.chunk;
      if (!Number.isInteger(part.index) || !Number.isInteger(part.total) || part.total < 2 || part.total > 16 || part.index < 0 || part.index >= part.total || typeof input !== 'string' || input.length > 128000) throw pciErrors.validation('Invalid command fragment.');
      if (!grant.assemblies) grant.assemblies = new Map();
      for (const [id, value] of grant.assemblies) if (value.expiresAt <= Date.now()) grant.assemblies.delete(id);
      let assembly = grant.assemblies.get(command.requestId);
      if (!assembly && part.index === 0 && grant.assemblies.size < 2) {
        assembly = {parts:[], bytes:0, total:part.total, expiresAt:Date.now()+30000};
        grant.assemblies.set(command.requestId, assembly);
      }
      if (!assembly || assembly.total !== part.total || assembly.parts.length !== part.index) throw pciErrors.validation('Incomplete command. Select the file again.');
      assembly.bytes += Buffer.byteLength(input);
      if (assembly.bytes > 1600000) { grant.assemblies.delete(command.requestId); throw pciErrors.validation('Request is too large.'); }
      assembly.parts.push(input);
      if (assembly.parts.length < assembly.total) return null;
      grant.assemblies.delete(command.requestId);
      try { input = JSON.parse(assembly.parts.join('')); } catch { throw pciErrors.validation('Invalid command.'); }
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw pciErrors.validation('Invalid command payload.');
    const method = String(input.method || 'GET').toLowerCase(), target = String(input.path || '');
    if (!target.startsWith('/api/v1/') || target.length > 4096 || /[\\#\r\n]/.test(target)) throw pciErrors.validation('Invalid resource path.');
    const parsed = new URL(target, 'https://pci.invalid');
    if (parsed.origin !== 'https://pci.invalid') throw pciErrors.forbidden();
    let match;
    for (const route of routes) {
      if (route.method !== method) continue;
      const result = new RegExp(route.pattern).exec(parsed.pathname);
      if (result) { match = { ...route, params: Object.fromEntries(route.params.map((name, i) => [name, decodeURIComponent(result[i + 1])])) }; break; }
    }
    if (!match) throw pciErrors.notFound('Unknown browser operation.');
    const body = input.body ?? {};
    if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 1500000) throw pciErrors.validation('Invalid or oversized request body.');
    const headers = input.headers || {};
    for (const name of Object.keys(headers)) {
      if (!['if-match','idempotency-key'].includes(name) || typeof headers[name] !== 'string' || headers[name].length > 128) throw pciErrors.validation('Unsupported command header.');
      msg.pciTrustedHeaders[name] = headers[name];
    }
    msg.route = match.route; msg.pciAction = match.action;
    msg.params = match.params; msg.query = Object.fromEntries(parsed.searchParams);
    msg.req = { method: method.toUpperCase(), params: msg.params, query: msg.query, originalUrl: target };
    msg.payload = body; msg.data = body;
    grant.inFlight.add(command.requestId);
    msg.pciCommandOwned = true;
    pciBridgeProgress('accepted', 'Request accepted');
    return [msg, null];
  } catch (error) { return emitError(error); }
}
