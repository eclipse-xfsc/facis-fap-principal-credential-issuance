import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {releaseArtifacts} from './release-artifacts.mjs';
// This validates evidence completeness and byte identity. The named reviewers
// remain responsible for the substance of the evidence and formal acceptance.
const root=path.resolve(new URL('..',import.meta.url).pathname);
const requirements=JSON.parse(fs.readFileSync(path.join(root,'docs/requirements/requirements.json')));
const technical=JSON.parse(fs.readFileSync(path.join(root,'docs/requirements/technical-clauses.json')));
const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function evaluateSignoff(receipt,directory){
 const errors=[],evidence=new Map(),seen=new Set();
 if(!receipt || typeof receipt!=='object' || Array.isArray(receipt))return ['Receipt must be an object'];
 if(!Array.isArray(receipt.evidence)||!Array.isArray(receipt.requirements)||!Array.isArray(receipt.technicalClauses)||!Array.isArray(receipt.environments))return ['Evidence, requirements, technicalClauses and environments must be arrays'];
 if(receipt.version!==version)errors.push('Release version differs');
 if(typeof receipt.reviewer!=='string'||!receipt.reviewer.trim()||!Number.isFinite(Date.parse(receipt.reviewedAt))||Date.parse(receipt.reviewedAt)>Date.now())errors.push('Named reviewer and completed review date required');
 if(!['IONOS','OSC'].every(x=>receipt.environments?.includes(x)))errors.push('IONOS and OSC acceptance are required');
 for(const e of receipt.evidence || []){
  if(!e || typeof e!=='object' || typeof e.path!=='string'){errors.push('Invalid evidence record');continue;}
  if(!e.id || evidence.has(e.id)){errors.push('Duplicate/missing evidence id');continue;}
  const target=path.resolve(directory,e.path || '');
  if(!target.startsWith(path.resolve(directory)+path.sep)){errors.push('Evidence path escapes receipt directory');continue;}
  try{if(!fs.realpathSync(target).startsWith(fs.realpathSync(directory)+path.sep)||!fs.statSync(target).isFile()||hash(fs.readFileSync(target))!==e.sha256)throw new Error();evidence.set(e.id,e);}catch{errors.push('Evidence missing or hash differs: '+e.id);}
 }
 for(const r of receipt.requirements || []){
  if(!r || typeof r!=='object' || typeof r.id!=='string'){errors.push('Invalid requirement record');continue;}
  if(seen.has(r.id)){errors.push('Duplicate requirement: '+r.id);continue;}seen.add(r.id);
  if(!requirements.items.some(x=>x.id===r.id))errors.push('Unknown requirement: '+r.id);
  if(r.status!=='PASS'||!Array.isArray(r.evidence)||!r.evidence.length||r.evidence.some(id=>!evidence.has(id)))errors.push('Not accepted with evidence: '+r.id);
 }
 for(const r of requirements.items)if(!seen.has(r.id))errors.push('Missing requirement: '+r.id);
 const clauses=new Set();
 for(const r of receipt.technicalClauses){
  if(!r || typeof r!=='object' || typeof r.id!=='string'){errors.push('Invalid technical clause record');continue;}
  if(clauses.has(r.id)){errors.push('Duplicate technical clause: '+r.id);continue;}clauses.add(r.id);
  if(!technical.items.some(x=>x.id===r.id))errors.push('Unknown technical clause: '+r.id);
  if(r.status!=='PASS'||!Array.isArray(r.evidence)||!r.evidence.length||r.evidence.some(id=>!evidence.has(id)))errors.push('Technical clause not accepted with evidence: '+r.id);
 }
 for(const r of technical.items)if(!clauses.has(r.id))errors.push('Missing technical clause: '+r.id);
 for(const [relative,digest] of Object.entries(releaseArtifacts(root)))if(receipt.artifacts?.[relative]!==digest)errors.push('Artifact not bound to evidence: '+relative);
 return errors;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{const file=path.resolve(process.argv[2]||'docs/release/acceptance.json'),receipt=JSON.parse(fs.readFileSync(file));const errors=evaluateSignoff(receipt,path.dirname(file));console.log(JSON.stringify({version,status:errors.length?'NOT_READY_FOR_SIGNOFF':'EVIDENCE_COMPLETE',errors},null,2));process.exitCode=errors.length?1:0;}catch{console.error('Acceptance receipt unavailable or invalid. See docs/testing/live-acceptance.md.');process.exitCode=1;}
}
