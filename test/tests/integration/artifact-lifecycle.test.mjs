import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {snapshotUI,recordUI,restoreUI,uninstallFlows} from '../../../automation/stage1/artifacts.mjs';

test('UI installation can be removed without losing original or unrelated files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pci-artifacts-')),ui=path.join(root,'ui'),state=path.join(root,'state');fs.mkdirSync(ui);
 try{
  fs.writeFileSync(path.join(ui,'index.html'),'original');fs.writeFileSync(path.join(ui,'custom.js'),'keep');
  snapshotUI(state,ui,['index.html','index.js']);fs.writeFileSync(path.join(ui,'index.html'),'pci');fs.writeFileSync(path.join(ui,'index.js'),'pci-js');recordUI(state,ui);
  snapshotUI(state,ui,['index.html','index.js']);restoreUI(state,ui,true);
  assert.equal(fs.readFileSync(path.join(ui,'index.html'),'utf8'),'pci');restoreUI(state,ui);
  assert.equal(fs.readFileSync(path.join(ui,'index.html'),'utf8'),'original');assert.equal(fs.existsSync(path.join(ui,'index.js')),false);
  assert.equal(fs.readFileSync(path.join(ui,'custom.js'),'utf8'),'keep');restoreUI(state,ui);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('uninstall detects later UI modifications and rejects symlink traversal before changing anything',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pci-artifacts-')),ui=path.join(root,'ui'),state=path.join(root,'state');fs.mkdirSync(ui);
 try{
  snapshotUI(state,ui,['index.html']);fs.writeFileSync(path.join(ui,'index.html'),'pci');recordUI(state,ui);fs.writeFileSync(path.join(ui,'index.html'),'edited');
  assert.throws(()=>restoreUI(state,ui),/UI-MODIFIED/);assert.equal(fs.readFileSync(path.join(ui,'index.html'),'utf8'),'edited');
  fs.symlinkSync(path.join(ui,'index.html'),path.join(ui,'other.html'));assert.throws(()=>snapshotUI(state,ui,['other.html']),/NONREGULAR/);
  assert.throws(()=>snapshotUI(state,ui,['../outside']),/INVALID-NAME/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('flow uninstall preserves revision and foreign tabs, includes added children, and rejects foreign references',()=>{
 const flows=[{id:'tab',type:'tab',label:'M1_PCI-Infrastructure'},{id:'owned',z:'tab',type:'function'},{id:'added',z:'tab',type:'inject'},{id:'other',type:'tab',label:'User flow'},{id:'keep',z:'other',type:'inject',wires:[[]]}];
 const manifest={version:1,nodes:['tab','owned']};
 assert.deepEqual(uninstallFlows({rev:'v7',flows},manifest),{rev:'v7',flows:flows.slice(3)});
 flows.at(-1).wires=[['owned']];assert.throws(()=>uninstallFlows({rev:'v7',flows},manifest),/FOREIGN-FLOW-REFERENCE/);
});
test('G0-only uninstall preserves all flows and refuses untracked manual PCI imports',()=>{
 const original={rev:'v1',flows:[{id:'user',type:'tab',label:'User flow'}]};assert.deepEqual(uninstallFlows(original,null),original);
 assert.throws(()=>uninstallFlows({...original,flows:[...original.flows,{id:'pci',type:'tab',label:'PCI_Interface'}]},null),/MISSING-OWNERSHIP/);
});
