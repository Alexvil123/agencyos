import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDetails,auditTitle,describeAudit,isSystemChange,AUDIT_CATEGORIES,type AuditRow} from '../src/lib/audit-view';

const row=(over:Partial<AuditRow>):AuditRow=>({id:'1',action:'update_time_tasks',entity_type:'time_tasks',entity_id:'t1',actor_id:'u1',old_value:null,new_value:null,created_at:'2026-10-12T05:00:00Z',...over});

test('titles read as sentences for table changes and app events',()=>{
  assert.equal(auditTitle(row({action:'insert_clients',entity_type:'clients'})),'Client added');
  assert.equal(auditTitle(row({action:'update_time_tasks'})),'Task changed');
  assert.equal(auditTitle(row({action:'delete_departments',entity_type:'departments'})),'Department removed');
  assert.equal(auditTitle(row({action:'jira_account_linked',entity_type:'x'})),'Jira account linked');
  assert.equal(auditTitle(row({action:'integration_saved',entity_type:'integration',new_value:{provider:'meta_social'}})),'Integration saved: meta social');
  assert.equal(auditTitle(row({action:'integration_account_removed',entity_type:'integration',new_value:{provider:'youtube'}})),'Integration account removed: youtube');
});

test('an update lists only the fields that changed, never noise or secrets',()=>{
  const details=auditDetails(row({old_value:{title:'Old',updated_at:'a',jira_updated_at:'b',status:'To Do',api_token:'secret-1',same:1},new_value:{title:'New',updated_at:'c',jira_updated_at:'d',status:'Done',api_token:'secret-2',same:1}}));
  assert.deepEqual(details,['Title: Old → New','Status: To Do → Done','Api token: •••• → ••••']);
  assert.ok(!details.join(' ').includes('secret-'));
});
test('an insert shows what was created and a delete what was removed; long values are cut and extras counted',()=>{
  assert.deepEqual(auditDetails(row({action:'insert_clients',new_value:{id:'x',display_name:'Acme Dental',organization_id:'o'}})),['Display name: Acme Dental']);
  assert.deepEqual(auditDetails(row({action:'delete_clients',old_value:{display_name:'Gone Ltd'},new_value:null})),['Display name: Gone Ltd']);
  const long=auditDetails(row({old_value:{a:'1',b:'1',c:'1',d:'1',e:'1',f:'1',g:'1',h:'x'.repeat(100)},new_value:{a:'2',b:'2',c:'2',d:'2',e:'2',f:'2',g:'2',h:'y'.repeat(100)}}));
  assert.equal(long.length,7);assert.equal(long[6],'+2 more');
  assert.ok(auditDetails(row({old_value:{h:'x'.repeat(100)},new_value:{h:'y'.repeat(100)}}))[0].includes('…'));
});

test('Jira sync changes are system changes; a person editing a manual task is not',()=>{
  assert.equal(isSystemChange(row({new_value:{source:'jira'}})),true);
  assert.equal(isSystemChange(row({new_value:{source:'manual'}})),false);
  assert.equal(isSystemChange(row({entity_type:'clients',new_value:{source:'jira'}})),false);
});
test('who is named from the people map; no actor means System; unknown ids are not guessed',()=>{
  assert.equal(describeAudit(row({}),{u1:'Alex'}).who,'Alex');
  assert.equal(describeAudit(row({actor_id:null}),{}).who,'System');
  assert.equal(describeAudit(row({actor_id:'zzz'}),{u1:'Alex'}).who,'Unknown user');
  assert.equal(describeAudit(row({entity_type:'finance_payments',action:'insert_finance_payments',new_value:{amount:10}}),{}).entity,'Payment');
});
test('filter categories map to real entity types and never include secrets-bearing tables by accident',()=>{
  assert.equal(AUDIT_CATEGORIES.all.types,null);
  assert.ok(AUDIT_CATEGORIES.tasks.types.includes('time_tasks'));
  assert.ok(AUDIT_CATEGORIES.finance.types.every(t=>t.startsWith('finance_')));
});
