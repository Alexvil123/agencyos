import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIT_ACTIONS,AUDIT_AREAS,auditActionsFor,describeAudit,isAuditArea,type AuditNames,type AuditRow} from '../src/lib/audit-view';

const names:AuditNames={users:{u1:'Alex',u2:'Barath'},members:{m1:'Karthika',m2:'Barath'}};
const row=(over:Partial<AuditRow>):AuditRow=>({id:'1',action:'jira_edit_completed',entity_type:'jira',entity_id:null,actor_id:'u1',old_value:null,new_value:null,created_at:'2026-10-12T05:00:00Z',...over});

test('only the agreed people-actions are listed; raw table changes and sync noise never are',()=>{
  assert.deepEqual([...AUDIT_ACTIONS].sort(),['employee_login_created','integration_account_added','integration_account_removed','integration_removed','integration_saved','jira_account_linked','jira_connection_saved','jira_create_completed','jira_create_uncertain','jira_edit_completed','jira_edit_uncertain','manual_client_removed','sales_access_changed','sales_edit_confirmed','work_task_order_changed']);
  for(const noise of ['update_time_tasks','insert_time_tasks','update_time_logs','jira_sync_completed','jira_edit_requested','sales_edit_requested','authentication_policy_changed'])assert.equal(describeAudit(row({action:noise}),names),null,noise);
});
test('each line names the person who did it, with the exact time kept for display',()=>{
  const line=describeAudit(row({actor_id:'u2',created_at:'2026-10-12T11:25:00Z'}),names)!;
  assert.equal(line.who,'Barath');assert.equal(line.at,'2026-10-12T11:25:00Z');
  assert.equal(describeAudit(row({actor_id:null}),names)!.who,'System');
  assert.equal(describeAudit(row({actor_id:'zzz'}),names)!.who,'Unknown user');
});
test('titles and details read as sentences',()=>{
  const t=(r:Partial<AuditRow>)=>describeAudit(row(r),names)!;
  assert.equal(t({action:'jira_create_completed',new_value:{issue_key:'OCT-1496'}}).title,'Jira task created · OCT-1496');
  assert.equal(t({action:'jira_edit_completed',new_value:{issue_key:'OCT-7'}}).title,'Jira task edited · OCT-7');
  assert.equal(t({action:'jira_connection_saved',new_value:{issue_key:'OAuth OCT,SEP'}}).details[0],'Connection: OAuth OCT,SEP');
  assert.equal(t({action:'jira_account_linked',entity_id:'m1',new_value:{account_id:'712020:abc'}}).title,'Jira account linked for Karthika');
  const sales=t({action:'sales_edit_confirmed',new_value:{tab:'Tirunelveli',row:77}});
  assert.equal(sales.title,'Sales sheet edited · Tirunelveli');assert.deepEqual(sales.details,['Row 77']);
  assert.deepEqual(t({action:'sales_access_changed',new_value:{members:['m2','m1']}}).details,['Now has access: Barath, Karthika']);
  assert.deepEqual(t({action:'sales_access_changed',new_value:{members:[]}}).details,['No one has Sales access now']);
  assert.equal(t({action:'employee_login_created',entity_id:'m2',new_value:{user_id:'u2'}}).title,'Employee login created for Barath');
  assert.equal(t({action:'employee_login_created',entity_id:'unknown',new_value:{user_id:'u2'}}).title,'Employee login created for Barath');
  assert.deepEqual(t({action:'work_task_order_changed',entity_id:'m1',new_value:{task_ids:['a','b','c']}}).details,['3 tasks in the queue']);
  assert.equal(t({action:'manual_client_removed',new_value:{task_history_preserved:true}}).details[0],'Task history was kept');
  assert.equal(t({action:'integration_saved',new_value:{provider:'meta_social'}}).title,'Integration saved: meta social');
  assert.equal(t({action:'integration_account_removed',new_value:{provider:'youtube'}}).title,'Integration account removed: youtube');
  assert.match(t({action:'jira_edit_uncertain',new_value:{issue_key:'OCT-9'}}).details[0],/did not confirm/);
});
test('audit lines never expose secrets: details only use the fields above',()=>{
  const line=describeAudit(row({action:'integration_saved',new_value:{provider:'google_ads',client_secret:'s3cret',token:'t0ken'}}),names)!;
  assert.ok(!JSON.stringify(line).includes('s3cret')&&!JSON.stringify(line).includes('t0ken'));
});
test('areas map to the actions in them, and unknown areas are rejected',()=>{
  assert.ok(isAuditArea('all')&&isAuditArea('jira')&&!isAuditArea('everything'));
  assert.deepEqual(auditActionsFor('sales').sort(),['sales_access_changed','sales_edit_confirmed']);
  assert.ok(auditActionsFor('jira').includes('jira_account_linked'));
  assert.equal(auditActionsFor('all').length,AUDIT_ACTIONS.length);
  assert.equal(Object.keys(AUDIT_AREAS).length,7);
});
