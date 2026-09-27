// Kubernetes helpers inlined only into infrastructure and reconciliation Function nodes.
function k8sRuntime() {
  let holder = global.get("fapPciK8sRuntime");
  const host = envValue("KUBERNETES_SERVICE_HOST", "");
  const port = envValue("KUBERNETES_SERVICE_PORT_HTTPS", envValue("KUBERNETES_SERVICE_PORT", "443"));
  if (!host) throw new Error("The ORCE Pod does not have in-cluster Kubernetes service environment variables.");
  if (!holder || holder.host !== host || holder.port !== port) {
    const tokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token";
    const caPath = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
    holder = {
      host,
      port,
      token: fs.readFileSync(tokenPath, "utf8").trim(),
      ca: fs.readFileSync(caPath),
      discovery: {},
    };
    global.set("fapPciK8sRuntime", holder);
  }
  return holder;
}
function k8sRequest(method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const runtime = k8sRuntime();
    const body = options.body === undefined || options.body === null
      ? null
      : Buffer.isBuffer(options.body) ? options.body : Buffer.from(String(options.body));
    const request = https.request({
      hostname: runtime.host,
      port: Number(runtime.port),
      path,
      method,
      ca: runtime.ca,
      rejectUnauthorized: true,
      headers: {
        authorization: `Bearer ${runtime.token}`,
        accept: "application/json",
        ...(options.headers || {}),
        ...(body ? { "content-length": body.length } : {}),
      },
      timeout: options.timeout || 30000,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = null;
        if (text) {
          try { data = JSON.parse(text); } catch { data = text; }
        }
        resolve({ status: response.statusCode || 0, headers: response.headers, data, text });
      });
    });
    request.on("timeout", () => request.destroy(new Error(`Kubernetes API timeout for ${method} ${path}`)));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}
async function k8sExpect(method, path, options = {}, allowed = [200, 201]) {
  const response = await k8sRequest(method, path, options);
  if (!allowed.includes(response.status)) {
    const detail = response.data && response.data.message ? response.data.message : `Kubernetes API returned ${response.status}`;
    const error = new Error(`${method} ${path}: ${detail}`);
    error.kubernetesStatus = response.status;
    error.kubernetesBody = response.data;
    throw error;
  }
  return response.data;
}
function apiParts(apiVersion) {
  const value = String(apiVersion || "");
  if (value === "v1") return { group: "", version: "v1" };
  const index = value.indexOf("/");
  if (index < 1) throw new Error(`Invalid apiVersion ${value}`);
  return { group: value.slice(0, index), version: value.slice(index + 1) };
}
async function k8sDescriptor(apiVersion, kind) {
  const runtime = k8sRuntime();
  const cacheKey = `${apiVersion}|${kind}`;
  if (runtime.discovery[cacheKey]) return runtime.discovery[cacheKey];
  const parts = apiParts(apiVersion);
  const discoveryPath = parts.group ? `/apis/${encodeURIComponent(parts.group)}/${encodeURIComponent(parts.version)}` : `/api/${encodeURIComponent(parts.version)}`;
  let lastDiscovery = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await k8sRequest("GET", discoveryPath);
    if (response.status === 200) {
      lastDiscovery = response.data;
      const match = (response.data.resources || []).find((resource) => resource.kind === kind && !String(resource.name || "").includes("/"));
      if (match) {
        const descriptor = { ...parts, plural: match.name, namespaced: Boolean(match.namespaced) };
        runtime.discovery[cacheKey] = descriptor;
        global.set("fapPciK8sRuntime", runtime);
        return descriptor;
      }
    }
    await sleep(1500);
  }
  throw new Error(`Kubernetes resource ${apiVersion} ${kind} is not discoverable${lastDiscovery ? " after API discovery" : ""}`);
}
function k8sCollectionPath(descriptor, namespace = "") {
  const base = descriptor.group
    ? `/apis/${encodeURIComponent(descriptor.group)}/${encodeURIComponent(descriptor.version)}`
    : `/api/${encodeURIComponent(descriptor.version)}`;
  if (!descriptor.namespaced) return `${base}/${descriptor.plural}`;
  if (!namespace) throw new Error(`Namespace is required for ${descriptor.plural}`);
  return `${base}/namespaces/${encodeURIComponent(namespace)}/${descriptor.plural}`;
}
function mutationNamespace(object, defaultNamespace = "") {
  return object && object.metadata && object.metadata.namespace ? String(object.metadata.namespace) : defaultNamespace;
}
function assertK8sMutationAllowed(object, defaultNamespace = "", options = {}) {
  if (!object || !object.apiVersion || !object.kind || !object.metadata || !object.metadata.name) throw new Error("Kubernetes object requires apiVersion, kind, metadata.name");
  const namespace = mutationNamespace(object, defaultNamespace);
  if (namespace && namespace === cfg.ocmNamespace) throw new Error(`FAP PCI is not permitted to modify the OCM namespace ${cfg.ocmNamespace}`);
  if (options.source === "envoy") return;
  const allowedNamespaces = new Set([cfg.orceNamespace, cfg.infrastructureNamespace, cfg.envoy.namespace]);
  if (namespace && !allowedNamespaces.has(namespace)) throw new Error(`Refusing Kubernetes mutation outside managed namespaces: ${namespace}`);
  const clusterKinds = new Set(["Namespace", "GatewayClass"]);
  if (!namespace && !clusterKinds.has(object.kind)) throw new Error(`Refusing unapproved cluster-scoped mutation: ${object.kind}/${object.metadata.name}`);
}
async function k8sApply(object, defaultNamespace = "", options = {}) {
  assertK8sMutationAllowed(object, defaultNamespace, options);
  const descriptor = await k8sDescriptor(object.apiVersion, object.kind);
  const namespace = descriptor.namespaced ? mutationNamespace(object, defaultNamespace) : "";
  if (descriptor.namespaced && !object.metadata.namespace) object.metadata.namespace = namespace;
  const path = `${k8sCollectionPath(descriptor, namespace)}/${encodeURIComponent(object.metadata.name)}?fieldManager=fap-pci-orce&force=true`;
  return k8sExpect("PATCH", path, {
    headers: { "content-type": "application/apply-patch+yaml" },
    body: yaml.stringify(object),
    timeout: options.timeout || 60000,
  }, [200, 201]);
}
async function k8sGet(apiVersion, kind, name, namespace = "") {
  const descriptor = await k8sDescriptor(apiVersion, kind);
  const path = `${k8sCollectionPath(descriptor, descriptor.namespaced ? namespace : "")}/${encodeURIComponent(name)}`;
  const response = await k8sRequest("GET", path);
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Error(`Kubernetes GET ${kind}/${name} failed with ${response.status}: ${response.data && response.data.message ? response.data.message : response.text}`);
  return response.data;
}
async function k8sList(apiVersion, kind, namespace = "", labelSelector = "") {
  const descriptor = await k8sDescriptor(apiVersion, kind);
  let path = k8sCollectionPath(descriptor, descriptor.namespaced ? namespace : "");
  if (labelSelector) path += `?labelSelector=${encodeURIComponent(labelSelector)}`;
  return k8sExpect("GET", path, {}, [200]);
}
async function k8sDelete(apiVersion, kind, name, namespace = "", options = {}) {
  const descriptor = await k8sDescriptor(apiVersion, kind);
  const fake = { apiVersion, kind, metadata: { name, ...(namespace ? { namespace } : {}) } };
  assertK8sMutationAllowed(fake, namespace, options);
  const path = `${k8sCollectionPath(descriptor, descriptor.namespaced ? namespace : "")}/${encodeURIComponent(name)}`;
  return k8sExpect("DELETE", path, { headers: { "content-type": "application/json" }, body: JSON.stringify({ apiVersion: "v1", kind: "DeleteOptions", propagationPolicy: "Foreground" }) }, [200, 202, 404]);
}
function conditionStatus(object, type) {
  const conditions = object && object.status && Array.isArray(object.status.conditions) ? object.status.conditions : [];
  return conditions.find((condition) => condition.type === type) || null;
}
function routeParentConditions(route) {
  const parents = route && route.status && Array.isArray(route.status.parents) ? route.status.parents : [];
  return parents.flatMap((parent) => Array.isArray(parent.conditions) ? parent.conditions : []);
}
function routeCondition(route, type) {
  return routeParentConditions(route).find((condition) => condition.type === type) || null;
}
async function waitFor(description, predicate, timeoutSeconds = 180, intervalMs = 3000) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) { lastError = error; }
    await sleep(intervalMs);
  }
  if (lastError) throw new Error(`${description} timed out: ${lastError.message}`);
  throw new Error(`${description} timed out after ${timeoutSeconds}s`);
}
async function fetchTextWithRedirects(urlValue, redirects = 5) {
  if (redirects < 0) throw new Error("Too many redirects while downloading a pinned manifest");
  const response = await requestRaw(urlValue, { timeout: 45000 });
  if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
    const next = new URL(response.headers.location, urlValue).toString();
    return fetchTextWithRedirects(next, redirects - 1);
  }
  if (response.status !== 200) throw new Error(`Manifest download failed with HTTP ${response.status}`);
  return response.text;
}
async function loadPinnedEnvoyManifest() {
  let text = "";
  if (cfg.envoy.manifestPath && fs.existsSync(cfg.envoy.manifestPath)) text = fs.readFileSync(cfg.envoy.manifestPath, "utf8");
  else text = await fetchTextWithRedirects(cfg.envoy.manifestUrl);
  const digest = crypto.createHash("sha256").update(text).digest("hex");
  if (digest !== cfg.envoy.manifestSha256) throw new Error(`Envoy Gateway manifest digest mismatch: expected ${cfg.envoy.manifestSha256}, got ${digest}`);
  return text;
}
async function applyYamlDocuments(text, options = {}) {
  const documents = yaml.parseAllDocuments(text);
  const applied = [];
  for (const document of documents) {
    if (document.errors && document.errors.length) throw new Error(`Invalid YAML document: ${document.errors[0].message}`);
    const object = document.toJSON();
    if (!object || !object.kind) continue;
    if (options.source === "envoy" && object.kind === "CustomResourceDefinition"
      && String(object.metadata && object.metadata.name || "").endsWith(".gateway.networking.k8s.io")) {
      const existing = await k8sGet("apiextensions.k8s.io/v1", "CustomResourceDefinition", object.metadata.name, "").catch(() => null);
      if (existing) {
        node.warn(`Preserving existing shared Gateway API CRD ${object.metadata.name}`);
        continue;
      }
    }
    applied.push(await k8sApply(object, object.metadata && object.metadata.namespace ? object.metadata.namespace : "", options));
  }
  return applied;
}
function gatewayAddress(gateway) {
  const addresses = gateway && gateway.status && Array.isArray(gateway.status.addresses) ? gateway.status.addresses : [];
  const preferred = addresses.find((entry) => entry.type === cfg.gatewayAddressType) || addresses[0];
  return preferred ? String(preferred.value || "") : "";
}
async function dnsMatchesHost(hostname, expectedAddress) {
  if (!hostname || !expectedAddress) return false;
  try {
    const addresses = await dns.promises.resolve4(hostname);
    return addresses.includes(expectedAddress);
  } catch {
    try {
      const aliases = await dns.promises.resolveCname(hostname);
      return aliases.some((alias) => alias.replace(/\.$/, "") === expectedAddress.replace(/\.$/, ""));
    } catch { return false; }
  }
}
