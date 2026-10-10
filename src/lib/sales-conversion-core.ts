import {z} from 'zod';
import {plainDescription} from './jira-types';
import type {SalesGrid} from './sales-sheet';
export const conversionSchema=z.object({enabled:z.boolean(),source_tab:z.enum(['Tracksheet','Leads']),name_column:z.string().min(1).max(255),status_column:z.string().min(1).max(255),won_value:z.string().min(1).max(255),jira_project:z.enum(['OCT','SEP']),issue_type:z.string().regex(/^\d+$/),summary_template:z.string().min(1).max(180).refine(v=>v.includes('{client}'))});
export type ConversionConfig=z.infer<typeof conversionSchema>;
export type ConversionSettings=ConversionConfig&{organization_id:string;owner_actor:string;updated_at:string;last_checked_at:string|null;last_error:string|null};
export type ConversionJob={id:string;organization_id:string;client_key:string;client_name:string;jira_label:string;source_tab:string;source_id:string;source_fingerprint:string;jira_project:string;issue_type:string;summary:string;state:'pending'|'creating'|'synced'|'failed'|'review'|'cancelled';jira_key:string|null;error:string|null;updated_at:string};
export function conversionCandidates(grid:SalesGrid,config:ConversionConfig){
 if(grid.readOnly||grid.identityColumn!==0)throw new Error('Conversion needs a live sheet with unique # IDs.');
 const names=grid.headers.map((h,i)=>h===config.name_column?i:-1).filter(i=>i>=0),statuses=grid.headers.map((h,i)=>h===config.status_column?i:-1).filter(i=>i>=0);
 if(names.length!==1||statuses.length!==1)throw new Error('Configured sheet columns changed. Review automation settings.');
 return grid.rows.filter(r=>r.cells[statuses[0]]?.text===config.won_value).map(r=>{const name=r.cells[names[0]]?.text.trim();if(!r.editable||!name||name.length>150)throw new Error('A closed deal has a missing company name or duplicate ID. Review the source sheet.');return {id:r.id,name,fingerprint:r.version};});
}
export function conversionIdentity(name:string){const clean=name.trim().normalize('NFC').replace(/\s+/gu,' '),label=clean.replace(/\s/gu,'_');if(!clean||label.length>150)throw new Error('Client name cannot form a valid Jira label.');return {client_key:clean.toLocaleLowerCase('en-US'),jira_label:label,client_name:clean};}
export function conversionPayload(job:ConversionJob){return {fields:{project:{key:job.jira_project},issuetype:{id:job.issue_type},summary:job.summary,labels:[job.jira_label],description:plainDescription(`Client onboarding: ${job.client_name}\nCreated from a closed Sales deal.\nCRM conversion reference: ${job.id}`)},properties:[{key:'agencyos.sales-conversion',value:{id:job.id}}]};}
