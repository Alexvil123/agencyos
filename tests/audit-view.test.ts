import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIT_ACTIONS,describeAudit,type AuditNames,type AuditRow} from '../src/lib/audit-view';

const names:AuditNames={users:{u1:'Alex',u2:'Barath'},members:{m1:'Karthika',m2:'Barath'}};
const row=(over:Partial<AuditRow>):AuditRow=>({id:'1',action:'jira_edit_completed',entity_type:'jira',entity_id:null,actor_id:'u1',old_value:null,new_value:null,created_at:'2026-10-12T05:00:00Z',...over});
const title=(r:Partial<AuditRow>)=>describeAudit(row(r),names)!.title;

test('only the agreed people-actions are listed; raw table changes and sync noise never are',()=>{
  assert.deepEqual([...AUDIT_ACTIONS].sort(),['employee_login_created','integration_account_added','integration_account_removed','integration_removed','integration_saved','jira_account_linked','jira_connection_saved','jira_create_completed','jira_create_uncertain','jira_edit_completed','jira_edit_uncertain','manual_client_removed','module_access_changed','sales_access_changed','sales_edit_confirmed','work_task_order_changed']);
  for(const noise of ['update_time_tasks','insert_time_tasks','update_time_logs','jira_sync_completed','jira_edit_requested','sales_edit_requested','authentication_policy_changed'])assert.equal(describeAudit(row({action:noise}),names),null,noise);
});
test('each line names the person who did it and keeps the exact time',()=>{
  const line=describeAudit(row({actor_id:'u2',created_at:'2026-10-12T11:25:00Z'}),names)!;
  assert.equal(line.who,'Barath');assert.equal(line.at,'2026-10-12T11:25:00Z');
  assert.equal(describeAudit(row({actor_id:null}),names)!.who,'System');
  assert.equal(describeAudit(row({actor_id:'zzz'}),names)!.who,'Unknown user');
});
test('titles read as sentences',()=>{
  assert.equal(title({action:'jira_create_completed',new_value:{issue_key:'OCT-1496'}}),'Jira task created · OCT-1496');
  assert.equal(title({action:'jira_edit_completed',new_value:{issue_key:'OCT-7 → Done'}}),'Jira task edited · OCT-7 → Done');
  assert.equal(title({action:'jira_connection_saved'}),'Jira connected');
  assert.equal(title({action:'jira_account_linked',entity_id:'m1'}),'Jira account linked for Karthika');
  assert.equal(title({action:'sales_edit_confirmed',new_value:{tab:'Tirunelveli',row:77}}),'Sales sheet edited · Tirunelveli (row 77)');
  assert.equal(title({action:'module_access_changed',new_value:{module:'finance'}}),'Finance access changed');
  assert.equal(title({action:'sales_access_changed',new_value:{members:['m1']}}),'Sales team access changed');
  assert.equal(title({action:'employee_login_created',entity_id:'unknown',new_value:{user_id:'u2'}}),'Employee login created for Barath');
  assert.equal(title({action:'work_task_order_changed',entity_id:'m1'}),'Task order changed for Karthika');
  assert.equal(title({action:'manual_client_removed'}),'Client removed from the directory');
  assert.equal(title({action:'integration_saved',new_value:{provider:'meta_social'}}),'Integration saved: meta social');
  assert.equal(title({action:'integration_account_removed',new_value:{provider:'youtube'}}),'Integration account removed: youtube');
});
test('a line never carries secrets from the stored values',()=>{
  const line=describeAudit(row({action:'integration_saved',new_value:{provider:'google_ads',client_secret:'s3cret',token:'t0ken'}}),names)!;
  assert.ok(!JSON.stringify(line).includes('s3cret')&&!JSON.stringify(line).includes('t0ken'));
});
