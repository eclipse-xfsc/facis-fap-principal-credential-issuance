// SPDX-License-Identifier: Apache-2.0
// Node-RED Function node. Synthetic participant records only.
// The Go/Goa repository authenticates the principal before calling this endpoint.
function respond(status, body) {
  msg.statusCode = status;
  msg.headers = { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" };
  msg.payload = body;
  return msg;
}

const expected = String(env.get("PCI_TEST_SOURCE_TOKEN") || "");
if (expected.length < 32) return respond(503, { code: "TEST_SOURCE_NOT_CONFIGURED" });
const headers = msg.req?.headers || {};
const supplied = String(headers.authorization || "");
const receivedHash = crypto.createHash("sha256").update(supplied).digest();
const expectedHash = crypto.createHash("sha256").update("Bearer " + expected).digest();
if (!crypto.timingSafeEqual(receivedHash, expectedHash)) return respond(401, { code: "TEST_SOURCE_UNAUTHORIZED" });
if (!/^application\/json(?:;|$)/i.test(String(headers["content-type"] || ""))) return respond(415, { code: "TEST_SOURCE_JSON_REQUIRED" });

const input = msg.payload;
if (!input || Array.isArray(input) || typeof input !== "object" || Object.keys(input).sort().join(",") !== "configurationId,subject,tenantId") return respond(400, { code: "TEST_SOURCE_INVALID_REQUEST" });
for (const name of ["tenantId", "configurationId", "subject"]) {
  if (typeof input[name] !== "string" || !input[name] || input[name].length > 256 || /[\x00-\x1f]/.test(input[name])) return respond(400, { code: "TEST_SOURCE_INVALID_SCOPE" });
}

let records;
try {
  const encoded = String(env.get("PCI_TEST_SOURCE_RECORDS") || "");
  if (encoded.length > 262144) throw new Error();
  records = JSON.parse(encoded);
} catch { return respond(503, { code: "TEST_SOURCE_RECORDS_INVALID" }); }

let claims = records;
for (const key of [input.tenantId, input.configurationId, input.subject]) {
  if (!claims || Array.isArray(claims) || typeof claims !== "object" || !Object.hasOwn(claims, key)) return respond(404, { code: "TEST_SOURCE_RECORD_NOT_FOUND" });
  claims = claims[key];
}
if (!claims || Array.isArray(claims) || typeof claims !== "object" || Object.keys(claims).length > 100 || Object.values(claims).some(value => !["string", "number", "boolean"].includes(typeof value)) || Buffer.byteLength(JSON.stringify(claims)) > 32768) return respond(503, { code: "TEST_SOURCE_RECORDS_INVALID" });

return respond(200, { tenantId: input.tenantId, configurationId: input.configurationId, subject: input.subject, claims });
