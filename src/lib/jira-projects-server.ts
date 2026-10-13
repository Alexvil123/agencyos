import 'server-only';
import {jiraRequest,type JiraCredentials} from './jira-http';
import {acceptedProjects,isMonthProject} from './jira-types';

// The CRM accepts the twelve month projects (JAN … DEC) and SOURCE. Jira only knows the ones that have been created, and a JQL query that names a
// missing project fails, so every search asks Jira which of the accepted projects exist first. A new month project (for example NOV) is picked up
// at the next sync without any change here.
const cache=new Map<string,{expires:number;keys:string[]}>();
export async function jiraProjectKeys(credentials:JiraCredentials,fresh=false):Promise<string[]>{
  const hit=cache.get(credentials.organizationId);
  if(!fresh&&hit&&hit.expires>Date.now())return hit.keys;
  try{
    const found=new Set<string>();
    for(let start=0;start<500;start+=100){
      const page=await jiraRequest<{values:{key:string}[];isLast?:boolean}>(credentials,`/rest/api/3/project/search?maxResults=100&startAt=${start}`);
      page.values.forEach(p=>found.add(p.key));
      if(page.isLast!==false||!page.values.length)break;
    }
    const result=acceptedProjects(found);
    cache.set(credentials.organizationId,{expires:Date.now()+5*60000,keys:result});
    return result;
  }catch{return hit?.keys||acceptedProjects([]);}
}
export const monthProjectKeys=async(credentials:JiraCredentials,fresh=false)=>(await jiraProjectKeys(credentials,fresh)).filter(isMonthProject);
