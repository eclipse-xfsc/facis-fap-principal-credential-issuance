import fs from 'node:fs';
const tab='pci-deployment-automation',runner='pci-deployment-runner',out='pci-deployment-status';
const nodes=[{id:tab,type:'tab',label:'PCI Deployment Automation',disabled:false,info:'Runs a mounted PCI release through scripts/lifecycle.py. Set PCI_RELEASE_ROOT and PCI_DEPLOY_CONFIG in this operator ORCE. No HTTP trigger. Structured result is available in flow context pci.deployment.'}];
for(const [i,operation] of ['deploy','upgrade','uninstall'].entries())nodes.push({id:`pci-deployment-${operation}`,type:'inject',z:tab,name:operation,props:[{p:'operation',v:operation,vt:'str'}],repeat:'',crontab:'',once:false,topic:'',x:160,y:100+i*70,wires:[[runner]]});
nodes.push({id:runner,type:'function',z:tab,name:'PCI release lifecycle',func:fs.readFileSync('automation/flows/lifecycle.js','utf8'),outputs:1,noerr:0,initialize:'',finalize:'',libs:[{var:'childProcess',module:'child_process'},{var:'path',module:'path'}],x:430,y:170,wires:[[out]]});
nodes.push({id:out,type:'debug',z:tab,name:'Safe deployment result',active:true,tosidebar:true,console:false,tostatus:false,complete:'payload',targetType:'msg',x:690,y:170,wires:[]});
fs.writeFileSync('automation/flows/pci-deployment.json',JSON.stringify(nodes,null,2)+'\n');
