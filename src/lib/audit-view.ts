// Turns raw audit_logs rows into something a person can read: who did what, when, and what changed. Pure, so it is easy to test.
export type AuditRow={id:string;action:string;entity_type:string;entity_id:string|null;actor_id:string|null;old_value:Record<string,unknown>|null;new_value:Record<string,unknown>|null;created_at:string};
export type AuditLine={id:string;title:string;entity:string;who:string;at:string;details:string[];system:boolean};

export const AUDIT_CATEGORIES={
  all:{label:'Everything',types:null},
  tasks:{label:'Tasks & timers',types:['time_tasks','time_logs','task_work_sessions']},
  attendance:{label:'Attendance',types:['time_attendance','time_breaks','time_corrections']},
  people:{label:'People & access',types:['employees','memberships','membership_roles','departments','invitations']},
  clients:{label:'Clients',types:['clients']},
  finance:{label:'Finance',types:['finance_invoices','finance_invoice_items','finance_payments']},
  integrations:{label:'Integrations',types:['integration']},
} as const;
export type AuditCategory=keyof typeof AUDIT_CATEGORIES;

const ENTITY:Record<string,string>={time_tasks:'Task',time_logs:'Task timer',task_work_sessions:'Work session',time_attendance:'Attendance',time_breaks:'Break',time_corrections:'Time correction',employees:'Employee',memberships:'Team member',membership_roles:'Role',departments:'Department',clients:'Client',organizations:'Company',invitations:'Invitation',announcements:'Announcement',finance_invoices:'Invoice',finance_invoice_items:'Invoice item',finance_payments:'Payment',integration:'Integration'};
const VERB:Record<string,string>={insert:'added',update:'changed',delete:'removed'};
const HIDDEN=new Set(['id','organization_id','created_at','updated_at','jira_updated_at','membership_id','organization','jira_metadata','description','labels']);
const SECRET=/(password|token|secret|encrypted|private|credential|api_?key|service_account)/i;
const IDENTITY=['title','display_name','name','jira_key','email','number','client_name','subject'];

const sentence=(text:string)=>{const t=text.replaceAll('_',' ').trim();return t?t[0].toUpperCase()+t.slice(1):t;};
const short=(value:unknown)=>{if(value===null||value===undefined||value==='')return '—';const t=typeof value==='object'?JSON.stringify(value):String(value);return t.length>60?t.slice(0,57)+'…':t;};
const show=(key:string,value:unknown)=>SECRET.test(key)?'••••':short(value);

/** A change made by the Jira sync is a system update, not something a person did; it is hidden unless asked for. */
export function isSystemChange(row:Pick<AuditRow,'entity_type'|'new_value'|'old_value'>){
  const source=(row.new_value||row.old_value||{}).source;
  return row.entity_type==='time_tasks'&&source==='jira';
}
export function auditTitle(row:Pick<AuditRow,'action'|'entity_type'|'new_value'|'old_value'>){
  const m=row.action.match(/^(insert|update|delete)_(.+)$/);
  if(m)return `${ENTITY[m[2]]||sentence(m[2])} ${VERB[m[1]]}`;
  const provider=String((row.new_value||{}).provider||'');
  if(row.action==='integration_saved')return `Integration saved${provider?`: ${provider.replaceAll('_',' ')}`:''}`;
  if(row.action==='integration_removed')return `Integration removed${provider?`: ${provider.replaceAll('_',' ')}`:''}`;
  if(row.action==='integration_account_added')return `Integration account added${provider?`: ${provider.replaceAll('_',' ')}`:''}`;
  if(row.action==='integration_account_removed')return `Integration account removed${provider?`: ${provider.replaceAll('_',' ')}`:''}`;
  return sentence(row.action);
}
/** What changed: for an update the fields whose value differs; otherwise the identifying fields. Secrets are masked, long values cut. */
export function auditDetails(row:Pick<AuditRow,'action'|'old_value'|'new_value'>,limit=6){
  const before=row.old_value||{},after=row.new_value||{},lines:string[]=[];
  if(row.action.startsWith('update_')&&row.old_value&&row.new_value){
    for(const key of Object.keys(after)){
      if(HIDDEN.has(key))continue;
      if(JSON.stringify(before[key])===JSON.stringify(after[key]))continue;
      lines.push(`${sentence(key)}: ${show(key,before[key])} → ${show(key,after[key])}`);
    }
  }else{
    const source=row.action.startsWith('delete_')?before:after;
    for(const key of IDENTITY)if(source[key]!==undefined&&source[key]!==null&&source[key]!=='')lines.push(`${sentence(key)}: ${show(key,source[key])}`);
    if(!lines.length)for(const [key,value] of Object.entries(source)){if(HIDDEN.has(key)||value===null||value==='')continue;lines.push(`${sentence(key)}: ${show(key,value)}`);}
  }
  return lines.slice(0,limit).concat(lines.length>limit?[`+${lines.length-limit} more`]:[]);
}
export function describeAudit(row:AuditRow,people:Record<string,string>):AuditLine{
  return {id:row.id,title:auditTitle(row),entity:ENTITY[row.entity_type]||sentence(row.entity_type),who:row.actor_id?(people[row.actor_id]||'Unknown user'):'System',at:row.created_at,details:auditDetails(row),system:isSystemChange(row)};
}
