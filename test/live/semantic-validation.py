#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Independent JSON-LD 1.1 and SHACL checks against the actual generated context."""
import copy,json,subprocess
from pathlib import Path
from pyld import jsonld
from rdflib import Graph,URIRef
from pyshacl import validate
ROOT=Path(__file__).resolve().parents[2]
contexts={u:json.loads((ROOT/'reference/participant-data-repository/contexts'/f).read_text()) for u,f in [('https://www.w3.org/2018/credentials/v1','credentials-v1.json'),('https://w3id.org/security/suites/jws-2020/v1','jws-2020-v1.json')]}
def loader(url,options=None):
    if url not in contexts:raise ValueError('Unapproved remote context')
    return {'contextUrl':None,'documentUrl':url,'document':copy.deepcopy(contexts[url])}
script="""import {configuration} from './test/support/sr2-fixture.mjs';import {sr2SemanticTemplate} from './backend/sr2/semantics.js';import {pciNativeMetadata} from './backend/sr2/native.js';const c={...configuration(),format:'ldp_vc',claims:[{name:'issuer',type:'string',required:true},{name:'type',type:'string',required:true},{name:'count',type:'number',required:true},{name:'enabled',type:'boolean',required:true}]};const origin='https://alpha.example.com/pci';const template=sr2SemanticTemplate(c,origin);const metadata=pciNativeMetadata({tenantId:'alpha',issuer:{issuer:origin},configurations:[{id:'c',data:c}]},()=>null);console.log(JSON.stringify({template,context:metadata.credential_configurations_supported[c.identifier].credential_definition['@context']}));"""
packet=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT));template=packet['template'];document=template['example']
assert document['@context']==packet['context']==template['context']['@context']
def graph(doc):
    normalized=jsonld.normalize(doc,{'algorithm':'URDNA2015','format':'application/n-quads','documentLoader':loader})
    return Graph().parse(data=normalized,format='nt'),normalized
original,nquads=graph(document)
assert list(original.triples((None,URIRef('https://www.w3.org/2018/credentials#issuer'),None)))
for term in ['issuer','type','count','enabled']:assert list(original.triples((None,URIRef(template['vocabulary']+term),None))),term+' disappeared from RDF'
shapes=Graph().parse(data=template['shacl'],format='turtle')
assert validate(original,shacl_graph=shapes)[0], 'Generated credential fails its own SHACL'
for name in ['issuer','type','count','enabled']:
    changed=copy.deepcopy(document);del changed['credentialSubject']['pciClaims'][name];g,n=graph(changed);assert n!=nquads and not validate(g,shacl_graph=shapes)[0],name+' required constraint missing'
changed=copy.deepcopy(document);changed['credentialSubject']['pciClaims']['enabled']='wrong-type';assert not validate(graph(changed)[0],shacl_graph=shapes)[0]
print(json.dumps({'status':'PASS','engine':'PyLD + RDFLib + pySHACL','remoteNetwork':False,'claimCollisionChecks':4,'missingClaimNegatives':4,'wrongDatatypeNegative':True}))
