// Only the helper's exact registered namespace is an external deletion target.
async function pciDeleteParticipant(tenant,parent){
  const data=parent?.data||{};let name=data.participant_namespace,role=data.participant_cleanup_role;
  if(!name&&!role){
    // Recover rc.4 crashes before registration. Read exact deterministic names;
    // never discover deletion targets through a mutable label selector.
    role='pci-participant-cleanup-'+tenant.tenant_id;
    const candidates=['pci-participant-'+tenant.tenant_id,'pci-participant-'+tenant.tenant_id.slice(0,8)];
    const found=[];
    for(const candidate of candidates){const r=await k8sRequest('GET','/api/v1/namespaces/'+candidate);if(r.status===200)found.push(candidate);else if(r.status!==404)throw new Error('PCI-PARTICIPANT-CLEANUP-ACCESS');}
    if(found.length>1)throw new Error('PCI-PARTICIPANT-REGISTRY');
    name=found[0]||candidates[0];
  }
  if(!['pci-participant-'+tenant.tenant_id,'pci-participant-'+tenant.tenant_id.slice(0,8)].includes(name)||role!=='pci-participant-cleanup-'+tenant.tenant_id)throw new Error('PCI-PARTICIPANT-REGISTRY');
  const targets=[['/api/v1/namespaces/'+encodeURIComponent(name),'namespace'],['/apis/rbac.authorization.k8s.io/v1/clusterroles/'+encodeURIComponent(role),'role']];
  const objects=[];
  for(const [path,kind]of targets){
    const r=await k8sRequest('GET',path);if(r.status===404){objects.push(null);continue;}if(r.status!==200)throw new Error('PCI-PARTICIPANT-CLEANUP-ACCESS');
    const m=r.data?.metadata,l=m?.labels||{};
    if(!m?.uid||!m.resourceVersion||l['xfsc.org/pci-tenant-id']!==tenant.tenant_id||l['xfsc.org/pci-owner-uid']!==tenant.owner_uid||l['xfsc.org/pci-install-uid']!==parent.metadata.uid||l['app.kubernetes.io/part-of']!=='fap-pci-reference')throw new Error('PCI-PARTICIPANT-OWNER');
    if(kind==='namespace'&&data.participant_namespace_uid&&data.participant_namespace_uid!==m.uid)throw new Error('PCI-PARTICIPANT-REPLACED');
    objects.push(r.data);
  }
  async function remove(index){const object=objects[index];if(!object)return;const m=object.metadata;await k8sExpect('DELETE',targets[index][0],{headers:{'content-type':'application/json'},body:JSON.stringify({apiVersion:'v1',kind:'DeleteOptions',preconditions:{uid:m.uid,resourceVersion:m.resourceVersion},propagationPolicy:'Foreground'})},[200,202,404]);}
  // Namespace deletion removes the Helm release record and all reference
  // workloads and trust. Do not erase the registry or its RBAC until GC ends.
  if(objects[0]){if(!objects[0].metadata.deletionTimestamp)await remove(0);return false;}
  if(objects[1])await remove(1); // its owner-referenced binding is collected
  return true;
}
