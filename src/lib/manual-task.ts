import {z} from 'zod';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s,'Invalid work date');
export function parseManualTask(form:FormData){
 const p=z.object({title:z.string().trim().min(1).max(255),client_choice:z.string().min(1),other_client:z.string().optional(),work_date:date,task_id:z.union([z.uuid(),z.literal('')]),expected:z.union([z.iso.datetime({offset:true}),z.literal('')])}).parse(Object.fromEntries(form));
 if(p.client_choice!=='other'&&!p.client_choice.startsWith('jira-label:'))throw Error('Choose a client');
 const source=p.client_choice==='other'?'other':'jira_label';
 const name=z.string().min(1).max(255).parse(source==='other'?(p.other_client||'').trim():p.client_choice.slice(11));
 return {...p,client_name:name,client_source:source};
}
