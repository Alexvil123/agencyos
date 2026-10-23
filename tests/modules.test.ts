import test from 'node:test';
import assert from 'node:assert/strict';
import {modules,moduleFor,moduleVisible,visibleGroups} from '../src/lib/modules';
test('every menu is a working module and sensitive menus are hidden from people who cannot use them',()=>{
  assert.ok(modules.every(m=>!('pending' in m)),'no placeholder menus remain');
  for(const key of ['calendar','analytics','campaigns','finance','communication'])assert.ok(moduleFor(key),key);
  const owner={owner:true,permissions:[],modules:[]},employee={owner:false,permissions:[],modules:[]},finance={owner:false,permissions:['finance.read'],modules:[]},granted={owner:false,permissions:[],modules:['campaigns','analytics']};assert.equal(moduleVisible('calendar',owner),true);assert.equal(moduleVisible('calendar',employee),false);assert.equal(moduleVisible('calendar',{...employee,modules:['calendar']}),true);
  assert.equal(moduleVisible('campaigns',owner),true);assert.equal(moduleVisible('campaigns',employee),false);assert.equal(moduleVisible('campaigns',finance),false);
  assert.equal(moduleVisible('finance',owner),true);assert.equal(moduleVisible('finance',employee),false);assert.equal(moduleVisible('finance',finance),true);
  assert.equal(moduleVisible('analytics',owner),true);assert.equal(moduleVisible('analytics',employee),false);
  assert.equal(moduleVisible('campaigns',granted),true);assert.equal(moduleVisible('analytics',granted),true);assert.equal(moduleVisible('finance',granted),false);
  assert.equal(moduleVisible('finance',{...employee,modules:['finance']}),true);
  assert.equal(moduleVisible('sales',owner),true);assert.equal(moduleVisible('sales',employee),false);assert.equal(moduleVisible('sales',{...employee,modules:['sales']}),true);assert.equal(moduleVisible('communication',owner),true);assert.equal(moduleVisible('communication',granted),false);
  for(const key of ['','work','chat','reports'])assert.equal(moduleVisible(key,employee),true,key);
  // Settings is empty for a plain employee, so its menu and page are only for the Owner, people with a settings/user/audit permission, and the setup preview.
  assert.equal(moduleVisible('settings',employee),false);assert.equal(moduleVisible('settings',finance),false);assert.equal(moduleVisible('settings',owner),true);
  for(const permission of ['settings.read','settings.manage','users.manage','audit.read'])assert.equal(moduleVisible('settings',{...employee,permissions:[permission]}),true,permission);
  assert.equal(moduleVisible('settings',{...employee,preview:true}),true);
  // No empty group headings: a plain employee has nothing under SYSTEM, so that heading is not shown.
  assert.deepEqual(visibleGroups(employee),['Workspace','Management']);
  assert.deepEqual(visibleGroups(owner),['Workspace','Management','System']);
  assert.deepEqual(visibleGroups({...employee,permissions:['audit.read']}),['Workspace','Management','System']);
});
