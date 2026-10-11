import {pciLdpContext,pciLdpVocabulary} from './linked-data.js';
// SPDX-License-Identifier: Apache-2.0
import {sr2Configuration,sr2Https} from './domain.js';

// Describes a configuration's declared data, never retrieved employee records.
// The vocabulary is tenant-local. A client-approved domain vocabulary can be
// reviewed separately without enabling arbitrary remote JSON-LD resolution.
export function sr2SemanticTemplate(configuration, issuer) {
  const c=sr2Configuration(configuration),origin=sr2Https(issuer).href.replace(/\/$/,'');
  const vocabulary=pciLdpVocabulary(c,origin),ldp=c.format==='ldp_vc';
  const vc='https://www.w3.org/2018/credentials#',xsd='http://www.w3.org/2001/XMLSchema#';
  const types=c.credentialTypes.length?c.credentialTypes:['VerifiableCredential',c.identifier];
  const iri=term=>term==='VerifiableCredential'?vc+term:/^(?:https?:|urn:)[^\s<>"{}|^`\\]+$/.test(term)?term:vocabulary+encodeURIComponent(term);
  const terms={'@version':1.1,'id':'@id','type':'@type',issuer:{'@id':vc+'issuer','@type':'@id'},credentialSubject:{'@id':vc+'credentialSubject','@type':'@id'},issuanceDate:{'@id':vc+'issuanceDate','@type':xsd+'dateTime'}};
  // Claim names such as "issuer" or "type" must not overwrite VC envelope
  // terms. A property-scoped context maps them only inside credentialSubject.
  terms.credentialSubject['@context']=Object.fromEntries(c.claims.map(claim=>[claim.name,vocabulary+encodeURIComponent(claim.name)]));
  const properties=Object.fromEntries(c.claims.map(claim=>[claim.name,{type:claim.type,...(claim.type==='string'?{maxLength:2000}:{})}]));
  const subjectSchema={$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',properties,required:c.claims.filter(claim=>claim.required).map(claim=>claim.name),additionalProperties:false};
  const constraints=c.claims.map(claim=>{
    const datatype=claim.type==='number'?'sh:or ( [ sh:datatype xsd:integer ] [ sh:datatype xsd:decimal ] [ sh:datatype xsd:double ] )':`sh:datatype xsd:${claim.type}`;
    return `  sh:property [ sh:path <${vocabulary+encodeURIComponent(claim.name)}> ; ${datatype} ; sh:minCount ${claim.required?1:0} ; sh:maxCount 1${claim.type==='string'?' ; sh:maxLength 2000':''} ]`;
  }).join(' ;\n');
  const shape=`@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <${xsd}> .
@prefix vc: <${vc}> .

<${vocabulary}CredentialShape> a sh:NodeShape ;
  sh:targetClass <${iri(types.find(type=>type!=='VerifiableCredential')||'VerifiableCredential')}> ;
  sh:property [ sh:path vc:issuer ; sh:minCount 1 ; sh:maxCount 1 ; sh:nodeKind sh:IRI ] ;
  sh:property [ sh:path vc:credentialSubject ; sh:minCount 1 ; sh:maxCount 1 ; sh:node <${vocabulary}SubjectShape> ] .

<${vocabulary}SubjectShape> a sh:NodeShape ;
  sh:nodeKind sh:IRI ;
${ldp?'  sh:property [ sh:path <'+vocabulary+'claims> ; sh:minCount 1 ; sh:maxCount 1 ; sh:node <'+vocabulary+'ClaimsShape> ] .\n\n<'+vocabulary+'ClaimsShape> a sh:NodeShape ;\n':''}${constraints} .
`;
  const values=Object.fromEntries(c.claims.map(claim=>[claim.name,claim.type==='boolean'?true:claim.type==='number'?1:'Synthetic '+claim.name]));
  return {identifier:c.identifier,format:c.format,vocabulary,context:{'@context':ldp?pciLdpContext(c,origin):terms},subjectSchema,shacl:shape,
    example:{'@context':ldp?pciLdpContext(c,origin):terms,id:'urn:uuid:11111111-1111-4111-8111-111111111111',type:ldp?types:types.map(iri),issuer:'did:web:'+new URL(origin).hostname,issuanceDate:'2026-10-07T00:00:00Z',credentialSubject:{id:'urn:example:synthetic-principal',...(ldp?{pciClaims:values}:values)}},
    notice:'Unsigned synthetic semantic example. This does not change the published credential or certify a FACIS/ETSI vocabulary. For SD-JWT this is the semantic view of the disclosed data.'};
}
