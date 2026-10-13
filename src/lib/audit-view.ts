// Audit history lists what people DO in the CRM: a short, fixed list of meaningful actions, each with who did it and when.
// Raw table changes (every task update from a Jira sync, timer ticks, ...) stay in the database but are not listed here.
export type AuditRow={id:string;action:string;entity_type:string;entity_id:string|null;actor_id:string|null;old_value:Record<string,unknown>|null;new_value:Record<string,unknown>|null;created_at:string};
export type AuditLine={id:string;title:string;who:string;at:string};
/** Names by id: users (who acted) and memberships (who the action was about). */
export type AuditNames={users:Record<string,string>;members:Record<string,string>};

const value=(row:AuditRow)=>row.new_value||row.old_value||{};
const text=(v:unknown)=>typeof v==='string'||typeof v==='number'?String(v):'';
const provider=(row:AuditRow)=>text(value(row).provider).replaceAll('_',' ');
const forMember=(row:AuditRow,names:AuditNames)=>names.members[row.entity_id||'']||names.users[text(value(row).user_id)]||'';
const withName=(base:string,name:string)=>name?`${base} for ${name}`:base;
const key=(row:AuditRow)=>text(value(row).issue_key);
const tail=(label:string,row:AuditRow)=>key(row)?`${label} · ${key(row)}`:label;
const suffix=(row:AuditRow,label:string)=>provider(row)?`${label}: ${provider(row)}`:label;

const TITLES:Record<string,(row:AuditRow,names:AuditNames)=>string>={
  jira_connection_saved:()=>'Jira connected',
  jira_edit_completed:r=>tail('Jira task edited',r),
  jira_edit_uncertain:r=>tail('Jira task edit not confirmed',r),
  jira_create_completed:r=>tail('Jira task created',r),
  jira_create_uncertain:r=>tail('Jira task creation not confirmed',r),
  jira_account_linked:(r,n)=>withName('Jira account linked',forMember(r,n)),
  work_task_order_changed:(r,n)=>withName('Task order changed',forMember(r,n)),
  sales_edit_confirmed:r=>{const v=value(r),tab=text(v.tab),row=text(v.row);return `Sales sheet edited${tab?` · ${tab}${row?` (row ${row})`:''}`:''}`;},
  sales_access_changed:()=>'Sales team access changed',
  employee_login_created:(r,n)=>withName('Employee login created',forMember(r,n)),
  manual_client_removed:()=>'Client removed from the directory',
  integration_saved:r=>suffix(r,'Integration saved'),
  integration_removed:r=>suffix(r,'Integration removed'),
  integration_account_added:r=>suffix(r,'Integration account added'),
  integration_account_removed:r=>suffix(r,'Integration account removed'),
};
/** The only actions the history lists. */
export const AUDIT_ACTIONS=Object.keys(TITLES);

export function describeAudit(row:AuditRow,names:AuditNames):AuditLine|null{
  const title=TITLES[row.action];if(!title)return null;
  return {id:row.id,title:title(row,names),who:row.actor_id?(names.users[row.actor_id]||'Unknown user'):'System',at:row.created_at};
}
