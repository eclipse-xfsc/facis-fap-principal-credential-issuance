import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('reference/participant-data-source/records.js','utf8');
const token='synthetic-test-only-'.repeat(3);
function invoke(payload,override={}) {
  const settings={PCI_TEST_SOURCE_TOKEN:token,PCI_TEST_SOURCE_RECORDS:JSON.stringify({alpha:{employee:{alice:{name:'Alex Example',employeeId:'TEST-001'}}},beta:{employee:{alice:{name:'Other Tenant'}}}}),...override.env};
  const context={msg:{payload,req:{headers:{authorization:'Bearer '+token,'content-type':'application/json',...override.headers}}},env:{get:k=>settings[k]},crypto,Buffer};
  return vm.runInNewContext('(function(){'+source+'})()',context);
}
test('ORCE record source authenticates and scopes all three record identifiers',()=>{
  const input={tenantId:'alpha',configurationId:'employee',subject:'alice'};
  const good=invoke(input);assert.equal(good.statusCode,200);assert.equal(good.payload.claims.name,'Alex Example');assert.equal(good.headers['cache-control'],'no-store');
  assert.equal(invoke(input,{headers:{authorization:'Bearer wrong'}}).statusCode,401);
  assert.equal(invoke({...input,subject:'bob'}).statusCode,404);
  assert.equal(invoke({...input,tenantId:'__proto__'}).statusCode,404);
  assert.equal(invoke({...input,configurationId:'unknown'}).statusCode,404);
  assert.equal(invoke({...input,participantJwt:'must not be sent'}).statusCode,400);
  assert.equal(invoke(input,{env:{PCI_TEST_SOURCE_TOKEN:''}}).statusCode,503);
});
test('the delivered flow contains no alternate issuer, keys, callbacks or debugging output',()=>{
  const flow=JSON.parse(fs.readFileSync('reference/participant-data-source/flows.json'));
  assert.equal(flow.filter(n=>n.type==='http in').length,1);
  assert.equal(flow.find(n=>n.type==='function').func,source);
  assert.ok(!flow.some(n=>['debug','http request','exec'].includes(n.type)));
});
