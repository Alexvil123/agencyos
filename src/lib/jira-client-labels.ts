import type {WorkJiraIssue} from './work-jira-sync';
export function jiraClientTotals(issues:Pick<WorkJiraIssue,'key'|'labels'>[]){
 const unique=[...new Map(issues.map(i=>[i.key,i])).values()],labelled=unique.filter(i=>i.labels.length>0).length;
 return {total:unique.length,labelled,unlabelled:unique.length-labelled,labelAssignments:unique.reduce((n,i)=>n+new Set(i.labels).size,0)};
}
export function jiraClientLabels(issues:Pick<WorkJiraIssue,'key'|'labels'|'status_category'|'project_key'>[]){
 const groups=new Map<string,{label:string;tasks:number;done:number;inProgress:number;projects:Set<string>}>();
 for(const issue of new Map(issues.map(i=>[i.key,i])).values()){
  for(const label of new Set(issue.labels)){
   const group=groups.get(label)||{label,tasks:0,done:0,inProgress:0,projects:new Set<string>()};
   group.tasks++;group.done+=Number(issue.status_category==='done');group.inProgress+=Number(issue.status_category==='indeterminate');group.projects.add(issue.project_key);groups.set(label,group);
  }
 }
 return [...groups.values()].sort((a,b)=>a.label.localeCompare(b.label)).map(g=>({...g,projects:[...g.projects].sort()}));
}
