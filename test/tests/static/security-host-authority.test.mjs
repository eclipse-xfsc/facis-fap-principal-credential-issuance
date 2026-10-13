import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const common = await readFile("backend/functions/_common.js", "utf8");
const auth = await readFile("backend/functions/auth.js", "utf8");
const provider = await readFile("backend/functions/provider.js", "utf8");
const baseFlow = JSON.parse(await readFile("dist/fap-pci-flow.json", "utf8"));

test("backend host authority comes only from HTTP or a validated server-owned bridge grant", async () => {
  assert.match(common, /return pciBridgeRequestHeaders\(\)/);
  assert.match(common, /msg\.req && msg\.req\.headers/);
  assert.doesNotMatch(common, /msg\.host\s*\|\|/);
  assert.doesNotMatch(auth, /input\.(?:host|hostname|origin|context)/);
  const bridge = await readFile('backend/functions/_bridge.js','utf8');
  assert.match(bridge, /grant\.socketId !== socketId/);
  assert.match(bridge, /await requireSession\(\[\]\)/);
});

test("provider administration fails closed when routed host is absent or not the main host", () => {
  assert.match(provider, /if \(!requestHost \|\| requestHost !== cfg\.mainHost\) throw pciErrors\.invalidTenantContext\(\)/);
});

test("uibuilder overwrites the socket identity and routes commands through grant validation", () => {
  const ui=baseFlow.find(node=>node.type==='uibuilder');
  assert.equal(ui.showMsgUib,true);
  const normalizer=baseFlow.find(node=>node.type==='function' && node.name==='Validate and route browser command');
  assert.ok(normalizer);
  assert.match(normalizer.func,/return pciNormalizeCommand\(/);
  assert.match(normalizer.func,/msg = \{ _socketId: socketId/);
  assert.doesNotMatch(normalizer.func,/handshakeCandidates|trustedUibuilderHeaders/);
});
