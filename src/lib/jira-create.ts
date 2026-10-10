import {JIRA_PROJECTS,plainDescription} from './jira-types';
import {parseJiraLabels} from './work-jira-sync';
export function jiraCreateFields(input:{project:string;issue_type:string;summary:string;description:string;labels:string}){
 if(!JIRA_PROJECTS.includes(input.project as typeof JIRA_PROJECTS[number]))throw Error('Invalid project');
 return {project:{key:input.project},issuetype:{id:input.issue_type},summary:input.summary,description:plainDescription(input.description),labels:parseJiraLabels(input.labels)};
}
