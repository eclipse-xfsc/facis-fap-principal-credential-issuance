// Check shipped documentation identities and local references without network.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const read=name=>JSON.parse(fs.readFileSync(name,'utf8'));
const version=fs.readFileSync('VERSION','utf8').trim();
const requirements=read('docs/requirements/requirements.json');
assert.equal(requirements.version,version);
const expected=[...Array.from({length:101},(_,i)=>'FR-PCI-'+String(i+1).padStart(2,'0')),...Array.from({length:8},(_,i)=>'TDR-'+String(i+1).padStart(2,'0'))];
assert.deepEqual(requirements.items.map(r=>r.id),expected);
for(const row of requirements.items){
  assert.ok(['DONE','PARTIAL','GAP'].includes(row.status),row.id);
  for(const field of ['implementation','checks'])for(const file of row[field].split(';').map(s=>s.trim()).filter(s=>s.includes('/')&&!s.includes(' ')))assert.ok(fs.existsSync(file),row.id+': '+file);
}
const technical=read('docs/requirements/technical-clauses.json');
assert.equal(technical.version,version);
assert.deepEqual(technical.items.map(r=>r.id),Array.from({length:83},(_,i)=>'TDC-'+String(i+1).padStart(3,'0')));
for(const row of technical.items){
 assert.ok(row.source.page>=2&&row.source.page<=7&&row.source.section&&row.closure,row.id);
 assert.ok(['DONE','EXCLUDED','BLOCKED_OWNER'].includes(row.development),row.id);
 for(const file of row.implementation)assert.ok(fs.existsSync(file),row.id+': '+file);
}
const spec=read('docs/specifications/manifest.json');
for(const file of spec.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join('docs/specifications',file.path))).digest('hex'),file.sha256);
const api=read('docs/api/openapi.json'),examples=read('docs/api/examples.json');
const catalogue=read('backend/sr2/routes.json').flatMap(module=>module.routes.map(([,summary,method,route,action])=>`${method.toUpperCase()} ${route.replace(/:([A-Za-z]+)/g,'{$1}')} ${action}`)).sort();
const managed=Object.entries(api.paths).flatMap(([route,item])=>Object.entries(item).filter(([,operation])=>operation?.['x-pci-action']).map(([method,operation])=>`${method.toUpperCase()} ${route} ${operation['x-pci-action']}`)).sort();
assert.deepEqual(managed,catalogue,'Generated API operations differ from current runtime routes');
assert.equal(examples.version,version);
const operations=Object.entries(api.paths).flatMap(([route,item])=>Object.keys(item).filter(method=>['get','post','put','patch','delete','head','options'].includes(method)).map(method=>method.toUpperCase()+' '+route)).sort();
assert.deepEqual(examples.items.map(item=>item.method+' '+item.path).sort(),operations);
for(const item of examples.items){
  const pointer=item.responseDefinitions.split('#/')[1].split('/').map(s=>s.replaceAll('~1','/').replaceAll('~0','~'));
  assert.ok(pointer.reduce((value,key)=>value?.[key],api),item.operationId);
}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const errors=[];
const markdown=files('.').filter(file=>file.endsWith('.md')&&!file.split(path.sep).some(part=>['node_modules','.git','.build','site','__pycache__','gen','wirepb'].includes(part)));
for(const file of markdown){
  const text=fs.readFileSync(file,'utf8').replace(/```[\s\S]*?```/g,'');
  for(const match of text.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)){
    const link=match[1];if(/^(?:https?:|mailto:|#)/.test(link))continue;
    const target=decodeURIComponent(link.split('#')[0]);if(target&&!fs.existsSync(path.resolve(path.dirname(file),target)))errors.push(file+' → '+target);
  }
}
assert.deepEqual(errors,[],'Broken local documentation links');
const navigation=spawnSync('python3',['-c',`import json,yaml
from pathlib import Path
config=yaml.safe_load(Path('mkdocs.yml').read_text())
targets=[]
def walk(value):
    if isinstance(value,str):
        if not value.startswith(('http:','https:')):targets.append(value)
    elif isinstance(value,list):
        for item in value:walk(item)
    elif isinstance(value,dict):
        for item in value.values():walk(item)
walk(config.get('nav',[]))
for target in targets:
    assert (Path(config.get('docs_dir','docs'))/target.split('#')[0]).is_file(),target
print(json.dumps({'status':'PASS','targets':len(targets)}))`],{encoding:'utf8'});
assert.equal(navigation.status,0,navigation.stderr);
console.log(JSON.stringify({documentation:'PASS',requirements:expected.length,technicalClauses:technical.items.length,apiExamples:operations.length,specifications:spec.files.length,markdownFiles:markdown.length,navigation:JSON.parse(navigation.stdout)}));
