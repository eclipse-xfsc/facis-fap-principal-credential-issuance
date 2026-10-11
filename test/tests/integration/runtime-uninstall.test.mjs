import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreRuntime} from '../../../automation/stage1/restore-runtime.mjs';

function fixture() {
  const original={metadata:{namespace:'pci',name:'orce',uid:'runtime-uid',resourceVersion:'10'},spec:{replicas:1,template:{metadata:{annotations:{owner:'operator'}},spec:{serviceAccountName:'original',automountServiceAccountToken:false,containers:[{name:'orce',image:'orce:original',envFrom:[{configMapRef:{name:'original'}}]}],volumes:[]}}}};
  const current=structuredClone(original);current.metadata.resourceVersion='20';
  const pod=current.spec.template.spec,c=pod.containers[0];
  current.spec.strategy={type:'Recreate'};
  pod.serviceAccountName='fap-pci-orce';pod.automountServiceAccountToken=true;
  c.envFrom.push({configMapRef:{name:'fap-pci-config'}},{secretRef:{name:'fap-pci-runtime'}});
  c.volumeMounts=[{name:'data',mountPath:'/data'},{name:'fap-pci-secrets',mountPath:'/var/run/fap-pci-secrets'},{name:'fap-pci-native-tls',mountPath:'/var/run/fap-pci-native-tls'}];
  pod.volumes=[{name:'data',persistentVolumeClaim:{claimName:'data'}},{name:'fap-pci-secrets',secret:{secretName:'fap-pci-runtime'}},{name:'fap-pci-native-tls',secret:{secretName:'native-tls'}}];
  current.spec.template.metadata.annotations['fap-pci.xfsc.org/version']='candidate';
  return {original,current,options:{namespace:'pci',deployment:'orce',container:'orce'}};
}
test('uninstall preserves later operator edits while removing only PCI runtime wiring',()=>{
  const {original,current,options}=fixture(),pod=current.spec.template.spec,c=pod.containers[0];
  c.image='orce:operator-upgrade';c.resources={limits:{memory:'3Gi'}};c.envFrom.push({secretRef:{name:'operator-new'}});
  pod.containers.push({name:'operator-sidecar',image:'sidecar:new'});current.spec.template.metadata.annotations['operator/new']='preserve';
  const patch=restoreRuntime(original,current,options),spec=patch.at(-1).value;
  assert.deepEqual(patch.slice(0,2),[{op:'test',path:'/metadata/uid',value:'runtime-uid'},{op:'test',path:'/metadata/resourceVersion',value:'20'}]);
  assert.equal(spec.template.spec.containers[0].image,'orce:operator-upgrade');
  assert.deepEqual(spec.template.spec.containers[0].resources,c.resources);
  assert.equal(spec.template.spec.containers[1].name,'operator-sidecar');
  assert.deepEqual(spec.template.spec.containers[0].envFrom,[{configMapRef:{name:'original'}},{secretRef:{name:'operator-new'}}]);
  assert.equal(spec.template.metadata.annotations['operator/new'],'preserve');
  assert.equal(spec.template.metadata.annotations['fap-pci.xfsc.org/version'],undefined);
  assert.equal(spec.template.spec.serviceAccountName,'original');assert.equal(spec.template.spec.automountServiceAccountToken,false);
  assert.deepEqual(spec.template.spec.volumes,[pod.volumes[0]]);assert.deepEqual(spec.template.spec.containers[0].volumeMounts,[c.volumeMounts[0]]);
  assert.equal(current.spec.template.spec.serviceAccountName,'fap-pci-orce','Planning must not mutate the caller snapshot');
});
test('uninstall refuses replacement runtimes and foreign dependencies and preserves a later service account',()=>{
  const {original,current,options}=fixture();
  current.metadata.uid='replaced';assert.throws(()=>restoreRuntime(original,current,options),/IDENTITY/);
  current.metadata.uid=original.metadata.uid;delete current.metadata.resourceVersion;assert.throws(()=>restoreRuntime(original,current,options),/IDENTITY/);
  current.metadata.resourceVersion='30';current.spec.template.spec.containers.push({name:'new',volumeMounts:[{name:'fap-pci-secrets',mountPath:'/trust'}]});
  assert.throws(()=>restoreRuntime(original,current,options),/FOREIGN-VOLUME/);
  current.spec.template.spec.containers.pop();current.spec.template.spec.serviceAccountName='later-operator-account';
  assert.equal(restoreRuntime(original,current,options).at(-1).value.template.spec.serviceAccountName,'later-operator-account');
});
