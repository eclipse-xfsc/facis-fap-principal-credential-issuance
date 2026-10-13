// Deterministic request examples, never captured credentials or server payloads.
import fs from 'node:fs';
const api=JSON.parse(fs.readFileSync('docs/api/openapi.json'));
const id='11111111-1111-4111-8111-111111111111';
const examples={
 Sr2Metadata:{profile:'oid4vci-1.0',issuer:'https://alpha-pci.example.com/pci-orce',authorizationServers:['https://alpha-pci.example.com/pci-orce'],did:'did:web:alpha-pci.example.com',jwksUrl:'https://alpha-pci.example.com/pci-orce/.well-known/jwks.json',displayName:'Alpha',tokenKeyRef:'preauth'},
 Sr2Branding:{title:'Alpha',description:'Synthetic employee credentials',accent:'#005FFF',background:'#E1E7EF',foreground:'#1f2937',font:'system',layout:'wide',corners:'rounded',footer:'Alpha credential service',logoAssetId:null},
 Sr2Configuration:{identifier:'Employee',name:'Employee credential',description:'Synthetic acceptance fixture',profile:'oid4vci-1.0',format:'jwt_vc_json',credentialTypes:['VerifiableCredential','EmployeeCredential'],claims:[{name:'department',type:'string',required:true}],signingMode:'internal-signing',keyRef:'issuer',statusProfile:'StatusList2021',eligibility:{roles:['principal'],subjects:[],entitlements:[]},ratePerMinute:10,blockReissuance:true},
 Sr2Flow:{name:'Employee request',steps:[{id:'consent',type:'consent',title:'Use employee data',text:'Synthetic acceptance only',fields:[]},{id:'offer',type:'offer',title:'Collect your credential',text:'Open your wallet',fields:[]}]},
 Sr2Connector:{configurationIds:[id],name:'Participant repository',endpoint:'https://pci-participant.pci-participant-alpha.svc.cluster.local:9443',serverName:'pci-participant.pci-participant-alpha.svc.cluster.local',protocolVersion:'participant-v1',tlsSecret:{name:'alpha-participant-client'},trustSecret:{name:'alpha-participant-client'},jwtIssuer:'https://identity.example.com/realms/fap-pci',jwtAudience:'participant-data',jwtScopes:['credential:issue'],signingModes:['internal-signing','participant-signed'],timeoutMs:10000,attempts:1,ratePerMinute:10,circuitFailureThreshold:3,circuitCooldownMs:30000},
 Sr2Assignment:{subject:'REPLACE_WITH_EXISTING_KEYCLOAK_SUBJECT',configurationIds:[id]},
 Sr2Settings:{ratePerMinute:30,maxConcurrent:2},
};
function sample(s={},depth=0){
 if(depth>12)return null;if(s.example!==undefined)return s.example;
 if(s.$ref){const name=s.$ref.split('/').at(-1);return examples[name]??sample(api.components.schemas[name],depth+1);}
 if(s.default!==undefined)return s.default;if(s.enum)return s.enum[0];if(s.oneOf||s.anyOf)return sample((s.oneOf||s.anyOf)[0],depth+1);
 if(s.allOf)return Object.assign({},...s.allOf.map(x=>sample(x,depth+1)));
 if(s.type==='object'||s.properties)return Object.fromEntries((s.required||Object.keys(s.properties||{})).filter(k=>s.properties?.[k]).map(k=>[k,sample(s.properties[k],depth+1)]));
 if(s.type==='array')return Array.from({length:s.minItems||1},()=>sample(s.items,depth+1));
 if(s.type==='integer'||s.type==='number')return Math.max(1,s.minimum||0);if(s.type==='boolean')return true;if(s.nullable)return null;
 if(s.format==='uuid')return id;if(s.format==='date-time')return '2026-10-07T00:00:00Z';if(s.format==='email')return 'synthetic@example.com';if(s.format==='uri'||s.format==='url')return 'https://example.com/value';
 return 'REPLACE_WITH_VALUE';
}
const items=[];for(const [route,entry]of Object.entries(api.paths))for(const [method,operation]of Object.entries(entry))if(['get','post','put','patch','delete','head','options'].includes(method)){
 const headers={Accept:'application/json'},parameters={};for(const p of operation.parameters||[]){if(p.in==='path')parameters[p.name]=sample(p.schema);else if(p.required&&p.in==='header')headers[p.name]=p.name==='If-Match'?'"1"':p.name==='Idempotency-Key'?'synthetic-request-00000001':sample(p.schema);}
 if(operation.security?.length)headers.Cookie='fap_pci_session=REPLACE_WITH_PRIVATE_SESSION';
 const content=Object.entries(operation.requestBody?.content||{})[0];if(content)headers['Content-Type']=content[0];
 items.push({operationId:operation.operationId||method+' '+route,method:method.toUpperCase(),path:route,pathParameters:parameters,headers,...(content?{body:sample(content[1].schema)}:{}),expectedSuccess:Object.keys(operation.responses||{}).filter(s=>/^2/.test(s)),...(operation['x-contract-status']?{contractStatus:operation['x-contract-status']}:{}),responseDefinitions:'openapi.json#/paths/'+route.replaceAll('~','~0').replaceAll('/','~1')+'/'+method+'/responses'});
}
fs.writeFileSync('docs/api/examples.json',JSON.stringify({version:api.info.version,purpose:'Synthetic request shapes. Replace IDs, private session, If-Match and resource bindings; these are not captured acceptance results. Consult OpenAPI response schemas and live BDD assertions.',items},null,2)+'\n');
console.log('[build-api-examples] '+items.length+' REST operation examples');
