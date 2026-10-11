#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

pci_source="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pci_notes="${PCI_TEST_NOTES:-$HOME/fap-pci/deployment-test-notes}"
test -f "$pci_source/test/live/wallet.mjs"

pci_work="$(mktemp -d)"
trap 'rm -rf "$pci_work"' EXIT

node --input-type=module - > "$pci_work/deployment.json" <<'CONFIG'
import {isIPv4} from 'node:net';
const required = name => {
  const value = process.env[name];
  if (!value) throw new Error('Set ' + name + ' for the target synthetic test.');
  return value;
};
const expectedIssuer = required('PCI_WALLET_ISSUER');
const issuer = new URL(expectedIssuer);
if (issuer.protocol !== 'https:' || issuer.username || issuer.password ||
    issuer.search || issuer.hash || expectedIssuer.endsWith('/'))
  throw new Error('PCI_WALLET_ISSUER must be an HTTPS issuer URL without credentials, query, fragment or trailing slash.');
const tenantId = required('PCI_WALLET_TENANT_ID');
const configurationId = required('PCI_WALLET_CONFIGURATION_ID');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuid.test(tenantId) || !uuid.test(configurationId))
  throw new Error('Tenant and configuration IDs must be UUIDs from the target deployment.');
if (process.env.PCI_WALLET_SYNTHETIC_ONLY !== 'true')
  throw new Error('Set PCI_WALLET_SYNTHETIC_ONLY=true only for a synthetic credential.');
const gatewayIp = process.env.PCI_WALLET_GATEWAY_IP || '';
if (gatewayIp && !isIPv4(gatewayIp))
  throw new Error('PCI_WALLET_GATEWAY_IP must be an IPv4 address or unset.');
console.log(JSON.stringify({syntheticOnly: true, expectedIssuer,
  profile: 'oid4vci-1.0', format: 'jwt_vc_json', tenantId,
  configurationId, gatewayIp}));
CONFIG

mkdir -p "$pci_notes"
read -r -s -p "Fresh credential offer link: " pci_offer </dev/tty
printf '\n'
read -r -s -p "Tenant fap_pci_session cookie VALUE: " pci_session </dev/tty
printf '\n'
[[ -n "$pci_offer" && -n "$pci_session" ]]

printf '%s' "$pci_offer" > "$pci_work/offer"
printf 'fap_pci_session=%s' "$pci_session" > "$pci_work/cookie"
unset pci_offer pci_session

jq -n \
  --rawfile offer "$pci_work/offer" \
  --rawfile cookie "$pci_work/cookie" \
  --slurpfile deployment "$pci_work/deployment.json" \
  '$deployment[0] + {offerUri: $offer, sessionCookie: $cookie}' > "$pci_work/input.json"

node --input-type=module - "$pci_source" "$pci_work/input.json" <<'JS' \
  2>&1 | tee "$pci_notes/rc12-alpha-wallet-result.log"
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const {testWallet} = await import(
  pathToFileURL(process.argv[2] + '/test/live/wallet.mjs').href
);
const input = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let step = 'initialization';

function safeCode(value) {
  const allowed = new Set(['invalid_request','invalid_grant','invalid_token','invalid_proof','invalid_nonce','invalid_credential_request','unsupported_credential_type','unsupported_credential_format','issuance_pending','temporarily_unavailable','server_error']);
  return allowed.has(value) ? value : 'unclassified';
}

async function diagnosticHttp(url, options = {}) {
  const endpoint = new URL(url);
  if (endpoint.origin !== new URL(input.expectedIssuer).origin)
    throw new Error('Unexpected endpoint origin');

  step = (options.method || 'GET') + ' ' + endpoint.pathname;
  console.log(JSON.stringify({step, state: 'started'}));

  const args = [
    '--http1.1', '--noproxy', '*',
    '--tlsv1.3', '--tls-max', '1.3',
    '--connect-timeout', '10', '--max-time', '40',
    '--silent', '--show-error',
    '--request', options.method || 'GET',
    '--write-out', '\n%{http_code}'
  ];
  if (input.gatewayIp)
    args.push('--resolve', endpoint.hostname + ':' + (endpoint.port || '443') + ':' + input.gatewayIp);

  const headersPath = process.argv[3] + '.headers';
  fs.writeFileSync(
    headersPath,
    Object.entries(options.headers || {})
      .map(([name, value]) => {
        if (/[\r\n]/.test(name + value))
          throw new Error('Invalid header');
        return name + ': ' + value;
      }).join('\n') + '\n',
    {mode: 0o600}
  );
  args.push('--header', '@' + headersPath);

  let body;
  if (options.body !== undefined) {
    body = typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body);
    args.push('--data-binary', '@-');
  }
  args.push(url);

  let output;
  try {
    output = execFileSync('curl', args, {
      input: body,
      encoding: 'utf8',
      timeout: 45000,
      maxBuffer: 2 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (error) {
    throw new Error(
      'Curl transport failed: ' + (error.status ?? error.code ?? 'unknown')
    );
  } finally {
    fs.rmSync(headersPath, {force: true});
  }

  const split = output.lastIndexOf('\n');
  const status = Number(output.slice(split + 1));
  const text = output.slice(0, split);

  console.log(JSON.stringify({
    step, state: 'received', httpStatus: status
  }));

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Endpoint returned non-JSON: HTTP ' + status);
  }

  if (status < 200 || status >= 300) {
    console.error(JSON.stringify({
      step,
      state: 'server-error',
      httpStatus: status,
      error: safeCode(data?.error)
    }));
  }

  return {status, data};
}

try {
  if (input.syntheticOnly !== true)
    throw new Error('Synthetic data acknowledgement required');
  console.log(JSON.stringify(await testWallet(input, diagnosticHttp)));
} catch (error) {
  const message = String(error.message);
  const safe = /^(Wallet endpoint HTTP \d+|Curl transport failed: [\w-]+|Endpoint returned non-JSON: HTTP \d+|Unexpected endpoint origin|Invalid header|Unknown issuance profile|Offer issuer differs|Discovery issuer differs|Use the expected single credential configuration|No access token|No wallet nonce|No credential|No issuer JWT|Issuer key unavailable|Unsupported issuer signature|Issuer signature failed|Credential lifetime or issuer differs|Holder key differs|Presentation not verified)$/;
  console.error(JSON.stringify({
    status: 'FAIL',
    step,
    code: 'PCI-LIVE-WALLET-FAILED',
    detail: safe.test(message) ? message : 'Failure after the last logged HTTP step.'
  }));
  process.exitCode = 1;
}
JS
