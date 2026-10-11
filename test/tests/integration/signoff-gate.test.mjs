import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { evaluateSignoff } from '../../../tools/signoff-gate.mjs';
import { releaseArtifacts } from '../../../tools/release-artifacts.mjs';

const root=path.resolve(new URL('../../../',import.meta.url).pathname);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pci-signoff-test-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const proof=Buffer.from('SYNTHETIC TEST FIXTURE: not live acceptance evidence\n');
 fs.writeFileSync(path.join(directory,'test.txt'),proof);
 const receipt={version:fs.readFileSync(path.join(root,'VERSION'),'utf8').trim(),reviewer:'Unit-test fixture',reviewedAt:'2026-01-01T00:00:00Z',environments:['IONOS','OSC'],evidence:[{id:'test',path:'test.txt',sha256:hash(proof)}],requirements:JSON.parse(fs.readFileSync(path.join(root,'docs/requirements/requirements.json'))).items.map(r=>({id:r.id,status:'PASS',evidence:['test']})),artifacts:releaseArtifacts(root)};
 receipt.technicalClauses=JSON.parse(fs.readFileSync(path.join(root,'docs/requirements/technical-clauses.json'))).items.map(r=>({id:r.id,status:'PASS',evidence:['test']}));
 return {directory,receipt};
}
test('sign-off gate rejects absent and incomplete acceptance receipts',t=>{
 const {directory,receipt}=fixture(t);
 for(const value of [null,[],{}, {...receipt,requirements:null}])assert.ok(evaluateSignoff(value,directory).length);
 const example=JSON.parse(fs.readFileSync(path.join(root,'docs/release/acceptance.example.json')));
 assert.ok(evaluateSignoff(example,directory).some(e=>e.includes('Not accepted with evidence')));
 const missing=structuredClone(receipt);missing.requirements.pop();
 assert.ok(evaluateSignoff(missing,directory).some(e=>e.startsWith('Missing requirement:')));
 const unknown=structuredClone(receipt);unknown.requirements.push({id:'FR-UNSPECIFIED',status:'PASS',evidence:['test']});
 assert.ok(evaluateSignoff(unknown,directory).some(e=>e.startsWith('Unknown requirement:')));
 const absent=structuredClone(receipt);delete absent.technicalClauses;
 assert.ok(evaluateSignoff(absent,directory).length);
 const groupedOnly=structuredClone(receipt);groupedOnly.technicalClauses.pop();
 assert.ok(evaluateSignoff(groupedOnly,directory).some(e=>e.startsWith('Missing technical clause:')));
 const unproved=structuredClone(receipt);unproved.technicalClauses[0].evidence=[];
 assert.ok(evaluateSignoff(unproved,directory).some(e=>e.startsWith('Technical clause not accepted with evidence:')));
});
test('sign-off evidence is bound to complete artifact hashes and unchanged local proof',t=>{
 const {directory,receipt}=fixture(t);
 assert.deepEqual(evaluateSignoff(receipt,directory),[]);
 const wrong=structuredClone(receipt);wrong.artifacts['dist/fap-pci-flow.json']='0'.repeat(64);
 assert.ok(evaluateSignoff(wrong,directory).some(e=>e==='Artifact not bound to evidence: dist/fap-pci-flow.json'));
 for(const file of ['reference/participant-data-source/flows.json','reference/participant-data-repository/repository.go','deployment/helm/observability/templates/runtime.yaml']){
  const incomplete=structuredClone(receipt);delete incomplete.artifacts[file];
  assert.ok(evaluateSignoff(incomplete,directory).includes('Artifact not bound to evidence: '+file));
 }
 fs.appendFileSync(path.join(directory,'test.txt'),'changed');
 assert.ok(evaluateSignoff(receipt,directory).some(e=>e==='Evidence missing or hash differs: test'));
});
test('sign-off gate refuses duplicate IDs and evidence outside the receipt directory',t=>{
 const {directory,receipt}=fixture(t),duplicate=structuredClone(receipt);
 duplicate.evidence.push({...duplicate.evidence[0]});duplicate.requirements.push({...duplicate.requirements[0]});
 assert.ok(evaluateSignoff(duplicate,directory).some(e=>e==='Duplicate/missing evidence id'));
 assert.ok(evaluateSignoff(duplicate,directory).some(e=>e.startsWith('Duplicate requirement:')));
 const outside=path.join(path.dirname(directory),path.basename(directory)+'-outside.txt');
 fs.writeFileSync(outside,'external fixture');t.after(()=>fs.rmSync(outside,{force:true}));
 fs.symlinkSync(outside,path.join(directory,'link.txt'));
 const escaped=structuredClone(receipt);escaped.evidence[0]={id:'test',path:'link.txt',sha256:hash(fs.readFileSync(outside))};
 assert.ok(evaluateSignoff(escaped,directory).some(e=>e==='Evidence missing or hash differs: test'));
 escaped.evidence[0].path=outside;
 assert.ok(evaluateSignoff(escaped,directory).some(e=>e==='Evidence path escapes receipt directory'));
});
