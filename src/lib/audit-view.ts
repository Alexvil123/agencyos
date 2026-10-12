// Audit history shows what people DO in the CRM: a short, fixed list of meaningful actions, each with who did it and when.
// Raw table changes (every task update from a Jira sync, timer ticks, ...) stay in the database but are not listed here.
export type AuditRow={id:string;action:string;entity_type:string;entity_id:string|null;actor_id:string|null;old_value:Record<string,unknown>|null;new_value:Record<string,unknown>|null;created_at:string};
export type AuditLine={id:string;title:string;area:string;who:string;at:string;details:string[]};
/** Names by id: users (who acted) and memberships (who the action was about). */
export type AuditNames={users:Record<string,string>;members:Record<string,string>};

type Event={area:AuditArea;title:(row:AuditRow,names:AuditNames)=>string;details?:(row:AuditRow,names:AuditNames)=>string[]};
export type AuditArea='jira'|'sales'|'work'|'people'|'clients'|'integrations';
export const AUDIT_AREAS:Record<AuditArea|'all',string>={all:'Everything',jira:'Jira',sales:'Sales',work:'Work',people:'People & access',clients:'Clients',integrations:'Integrations'};

const value=(row:AuditRow)=>row.new_value||row.old_value||{};
const text=(v:unknown)=>typeof v==='string'||typeof v==='number'?String(v):'';
const provider=(row:AuditRow)=>text(value(row).provider).replaceAll('_',' ');
const forMember=(row:AuditRow,names:AuditNames)=>names.members[row.entity_id||'']||names.users[text(value(row).user_id)]||'';
const withName=(base:string,name:string)=>name?`${base} for ${name}`:base;
const key=(row:AuditRow)=>text(value(row).issue_key);
const people=(ids:unknown,names:AuditNames)=>Array.isArray(ids)?ids.map(id=>names.members[String(id)]||names.users[String(id)]||'Unknown').sort():[];

const EVENTS:Record<string,Event>={
  jira_connection_saved:{area:'jira',title:()=>'Jira connected',details:r=>key(r)?[`Connection: ${key(r)}`]:[]},
  jira_edit_completed:{area:'jira',title:r=>`Jira task edited${key(r)?` · ${key(r)}`:''}`},
  jira_edit_uncertain:{area:'jira',title:r=>`Jira task edit not confirmed${key(r)?` · ${key(r)}`:''}`,details:()=>['Jira did not confirm the change. Check the task in Jira.']},
  jira_create_completed:{area:'jira',title:r=>`Jira task created${key(r)?` · ${key(r)}`:''}`},
  jira_create_uncertain:{area:'jira',title:r=>`Jira task creation not confirmed${key(r)?` · ${key(r)}`:''}`,details:()=>['Jira did not confirm the task. Check Jira before creating it again.']},
  jira_account_linked:{area:'jira',title:(r,n)=>withName('Jira account linked',forMember(r,n)),details:r=>text(value(r).account_id)?[`Jira account: ${text(value(r).account_id)}`]:[]},
  work_task_order_changed:{area:'work',title:(r,n)=>withName('Task order changed',forMember(r,n)),details:r=>{const ids=value(r).task_ids;return Array.isArray(ids)?[`${ids.length} task${ids.length===1?'':'s'} in the queue`]:[];}},
  sales_edit_confirmed:{area:'sales',title:r=>`Sales sheet edited${text(value(r).tab)?` · ${text(value(r).tab)}`:''}`,details:r=>[text(value(r).row)?`Row ${text(value(r).row)}`:''].filter(Boolean)},
  sales_access_changed:{area:'sales',title:()=>'Sales team access changed',details:(r,n)=>{const p=people(value(r).members,n);return p.length?[`Now has access: ${p.join(', ')}`]:['No one has Sales access now'];}},
  employee_login_created:{area:'people',title:(r,n)=>withName('Employee login created',forMember(r,n))},
  manual_client_removed:{area:'clients',title:()=>'Client removed from the directory',details:r=>[value(r).task_history_preserved?'Task history was kept':''].filter(Boolean)},
  integration_saved:{area:'integrations',title:r=>`Integration saved${provider(r)?`: ${provider(r)}`:''}`},
  integration_removed:{area:'integrations',title:r=>`Integration removed${provider(r)?`: ${provider(r)}`:''}`},
  integration_account_added:{area:'integrations',title:r=>`Integration account added${provider(r)?`: ${provider(r)}`:''}`},
  integration_account_removed:{area:'integrations',title:r=>`Integration account removed${provider(r)?`: ${provider(r)}`:''}`},
};
/** The only actions the history lists. */
export const AUDIT_ACTIONS=Object.keys(EVENTS);
export const auditActionsFor=(area:AuditArea|'all')=>area==='all'?AUDIT_ACTIONS:AUDIT_ACTIONS.filter(a=>EVENTS[a].area===area);
export const isAuditArea=(v:string):v is AuditArea|'all'=>v==='all'||v in AUDIT_AREAS;

export function describeAudit(row:AuditRow,names:AuditNames):AuditLine|null{
  const event=EVENTS[row.action];if(!event)return null;
  return {id:row.id,title:event.title(row,names),area:AUDIT_AREAS[event.area],who:row.actor_id?(names.users[row.actor_id]||'Unknown user'):'System',at:row.created_at,details:event.details?event.details(row,names):[]};
}
