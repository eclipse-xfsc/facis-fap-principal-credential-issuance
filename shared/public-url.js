/**
 * Canonical public URL/base-path helpers shared by the browser bundle and the
 * generated ORCE Function nodes.
 *
 * PCI_ORCE_BASE_PATH is a path prefix, never a URL. All external URLs are HTTPS.
 */
const SAFE_BASE_SEGMENT = /^[A-Za-z0-9._~-]+$/;

function rejectUrlLikePath(raw, label) {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) throw new Error(`${label} must be a path prefix, not a URL`);
  if (raw.startsWith("//")) throw new Error(`${label} must not be protocol-relative`);
  if (/[?#\\]/.test(raw)) throw new Error(`${label} must not contain query strings, fragments, or backslashes`);
  if (/\s|[\u0000-\u001F\u007F]/.test(raw)) throw new Error(`${label} must not contain whitespace or control characters`);
}

export function normalizeBasePath(value = "") {
  const raw = String(value ?? "").trim();
  if (raw === "" || raw === "/") return "";
  rejectUrlLikePath(raw, "PCI_ORCE_BASE_PATH");

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = withLeadingSlash.replace(/\/+$/, "");
  if (!normalized || normalized === "/") return "";
  if (normalized.includes("//")) throw new Error("PCI_ORCE_BASE_PATH must not contain empty path segments");

  const segments = normalized.slice(1).split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") throw new Error("PCI_ORCE_BASE_PATH must not contain dot segments");
    if (segment.includes("%")) throw new Error("PCI_ORCE_BASE_PATH must not contain percent-encoded segments");
    if (!SAFE_BASE_SEGMENT.test(segment)) throw new Error(`PCI_ORCE_BASE_PATH contains an unsafe segment: ${segment}`);
  }
  return normalized;
}


function splitApplicationReference(value = "/") {
  const raw = String(value ?? "").trim();
  if (!raw) return { pathname: "/", suffix: "" };
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) throw new Error("application path must not be a URL");
  if (raw.startsWith("//")) throw new Error("application path must not be protocol-relative");
  if (/\\|\s|[\u0000-\u001F\u007F]/.test(raw)) throw new Error("application path must not contain backslashes, whitespace, or control characters");
  const queryIndex = raw.indexOf("?");
  const fragmentIndex = raw.indexOf("#");
  const indexes = [queryIndex, fragmentIndex].filter((index) => index >= 0);
  const boundary = indexes.length ? Math.min(...indexes) : raw.length;
  return { pathname: raw.slice(0, boundary) || "/", suffix: raw.slice(boundary) };
}

export function normalizeApplicationPath(value = "/") {
  const raw = String(value ?? "").trim();
  if (!raw) return "/";
  rejectUrlLikePath(raw, "application path");

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  if (withLeadingSlash === "/") return "/";
  if (withLeadingSlash.includes("//")) throw new Error("application path must not contain empty path segments");

  const trailingSlash = withLeadingSlash.endsWith("/");
  const body = trailingSlash ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
  const segments = body.slice(1).split("/");
  for (const segment of segments) {
    if (!segment) throw new Error("application path must not contain empty path segments");
    let decoded;
    try { decoded = decodeURIComponent(segment); } catch { throw new Error("application path contains invalid percent encoding"); }
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
      throw new Error("application path must not contain encoded or literal traversal segments");
    }
  }
  return `${body}${trailingSlash ? "/" : ""}`;
}

export function withBasePath(path, basePath = "") {
  const base = normalizeBasePath(basePath);
  const { pathname, suffix } = splitApplicationReference(path);
  const applicationPath = normalizeApplicationPath(pathname);
  let prefixed;
  if (!base) prefixed = applicationPath;
  else if (applicationPath === base || applicationPath.startsWith(`${base}/`)) prefixed = applicationPath;
  else if (applicationPath === "/") prefixed = `${base}/`;
  else prefixed = `${base}${applicationPath}`;
  return `${prefixed}${suffix}`;
}

export function normalizePublicHost(value) {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!raw) throw new Error("public host is required");
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw) || raw.startsWith("//") || /[/?#@\\\s]/.test(raw)) {
    throw new Error("public host must be a hostname, not a URL");
  }

  const match = /^(.*?)(?::([0-9]{1,5}))?$/.exec(raw);
  const hostname = match ? match[1] : "";
  const port = match && match[2] ? Number(match[2]) : null;
  const validDns = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname);
  if (!validDns || (port !== null && (port < 1 || port > 65535))) throw new Error("public host is invalid");
  return port === null ? hostname : `${hostname}:${port}`;
}

export function publicOrigin(host) {
  return `https://${normalizePublicHost(host)}`;
}

export function publicUrl(host, path = "/", basePath = "") {
  return `${publicOrigin(host)}${withBasePath(path, basePath)}`;
}

export function uiPath(basePath = "") {
  return withBasePath("/ui/", basePath);
}

export function apiPath(path = "/", basePath = "") {
  const suffix = normalizeApplicationPath(path);
  const apiRelative = suffix === "/" ? "/api/v1/" : `/api/v1${suffix}`;
  return withBasePath(apiRelative, basePath);
}

export function uiUrl(host, basePath = "") {
  return publicUrl(host, "/ui/", basePath);
}
