import test from 'node:test';
import assert from 'node:assert/strict';
import {modules,moduleFor,moduleVisible} from '../src/lib/modules';
test('every menu is a working module and sensitive menus are hidden from people who cannot use them',()=>{
  assert.ok(modules.every(m=>!('pending' in m)),'no placeholder menus remain');
  for(const key of ['calendar','analytics','campaigns','finance','communication'])assert.ok(moduleFor(key),key);
  const owner={owner:true,permissions:[]},employee={owner:false,permissions:[]},finance={owner:false,permissions:['finance.read']};
  assert.equal(moduleVisible('campaigns',owner),true);assert.equal(moduleVisible('campaigns',employee),false);assert.equal(moduleVisible('campaigns',finance),false);
  assert.equal(moduleVisible('finance',owner),true);assert.equal(moduleVisible('finance',employee),false);assert.equal(moduleVisible('finance',finance),true);
  for(const key of ['','sales','work','calendar','analytics','chat','reports','settings'])assert.equal(moduleVisible(key,employee),true,key);
});
