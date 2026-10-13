import test from 'node:test';
import assert from 'node:assert/strict';
import {modules,moduleFor,moduleVisible} from '../src/lib/modules';
test('every menu is a working module and sensitive menus are hidden from people who cannot use them',()=>{
  assert.ok(modules.every(m=>!('pending' in m)),'no placeholder menus remain');
  for(const key of ['calendar','analytics','campaigns','finance','communication'])assert.ok(moduleFor(key),key);
  const owner={owner:true,permissions:[],modules:[]},employee={owner:false,permissions:[],modules:[]},finance={owner:false,permissions:['finance.read'],modules:[]},granted={owner:false,permissions:[],modules:['campaigns','analytics']};assert.equal(moduleVisible('calendar',owner),true);assert.equal(moduleVisible('calendar',employee),false);assert.equal(moduleVisible('calendar',{...employee,modules:['calendar']}),true);
  assert.equal(moduleVisible('campaigns',owner),true);assert.equal(moduleVisible('campaigns',employee),false);assert.equal(moduleVisible('campaigns',finance),false);
  assert.equal(moduleVisible('finance',owner),true);assert.equal(moduleVisible('finance',employee),false);assert.equal(moduleVisible('finance',finance),true);
  assert.equal(moduleVisible('analytics',owner),true);assert.equal(moduleVisible('analytics',employee),false);
  assert.equal(moduleVisible('campaigns',granted),true);assert.equal(moduleVisible('analytics',granted),true);assert.equal(moduleVisible('finance',granted),false);
  assert.equal(moduleVisible('finance',{...employee,modules:['finance']}),true);
  assert.equal(moduleVisible('communication',owner),true);assert.equal(moduleVisible('communication',granted),false);
  for(const key of ['','sales','work','chat','reports','settings'])assert.equal(moduleVisible(key,employee),true,key);
});
