import type {TimeTask} from './time-types';

/** SOURCE is a reference library; manual tasks and other Jira projects are work. */
export function workRecordScope(tasks:TimeTask[],sourceRecords=false):TimeTask[]{
 return tasks.filter(task=>sourceRecords
  ?task.source==='jira'&&task.jira_project==='SOURCE'
  :!(task.source==='jira'&&task.jira_project==='SOURCE'));
}
