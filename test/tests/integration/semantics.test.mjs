import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,configuration,alpha,beta} from '../../support/sr2-fixture.mjs';
import {httpHarness} from '../../support/sr2-http.mjs';
import {sr2SemanticTemplate} from '../../../backend/sr2/semantics.js';

test('every scalar configuration can export a bounded semantic contract without employee data',()=>{
 const c={...configuration(),claims:[{name:'issuer',type:'string',required:true},{name:'count',type:'number',required:false},{name:'enabled',type:'boolean',required:true}]};
 const result=sr2SemanticTemplate(c,'https://alpha-pci.example.com/pci');
 assert.deepEqual(result.subjectSchema.required,['issuer','enabled']);assert.equal(result.subjectSchema.additionalProperties,false);
 assert.equal(result.context['@context'].issuer['@id'],'https://www.w3.org/2018/credentials#issuer');
 assert.equal(result.context['@context'].credentialSubject['@context'].issuer,result.vocabulary+'issuer');
 assert.match(result.shacl,/sh:datatype xsd:integer/);assert.match(result.shacl,/sh:datatype xsd:boolean/);
 assert.equal(result.example.credentialSubject.issuer,'Synthetic issuer');
 const sd=sr2SemanticTemplate({...c,format:'dc+sd-jwt',credentialTypes:[],vct:'Employee'},'https://beta-pci.example.com');
 assert.equal(sd.format,'dc+sd-jwt');assert.notEqual(sd.vocabulary,result.vocabulary);
 assert.throws(()=>sr2SemanticTemplate(c,'http://untrusted.example'),/HTTPS/);
});

test('template export checks the live configuration assignment and tenant boundary',async()=>{
 const f=fixture(),{config}=await f.prepared(),url='/api/v1/tenants/'+alpha+'/credential-configurations/'+config.id+'/semantic-template';
 const get=httpHarness(f);const good=await get(url);assert.equal(good.status,200);assert.equal(good.body.configurationId,config.id);
 assert.equal(JSON.stringify(good.body).includes(f.privateClaim),false);
 assert.equal((await httpHarness(f,'principal')(url)).status,404);
 assert.equal((await get(url.replace(alpha,beta))).status,404);
 const grant=(await f.api.assignments(f.principal(),'grant',null,{subject:'issuer',configurationIds:[config.id]})).item;
 assert.equal((await httpHarness(f,'issuer')(url)).status,200);
 await f.api.assignments(f.principal(),'revoke',grant.id);
 assert.equal((await httpHarness(f,'issuer')(url)).status,404);
});
