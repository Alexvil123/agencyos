export const JIRA_SITE = 'https://vilpowerdigitalmarketing.atlassian.net';
// Work lives in one Jira project per month (JAN … DEC); SOURCE is the reference library. A month project only appears once it exists in Jira.
export const MONTH_PROJECTS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
export const JIRA_PROJECTS = [...MONTH_PROJECTS, 'SOURCE'] as const;
type MonthProject = typeof MONTH_PROJECTS[number];
export const isMonthProject = (value: string): value is MonthProject => (MONTH_PROJECTS as readonly string[]).includes(value);
const keyPattern = (projects: readonly string[]) => new RegExp('^(' + projects.join('|') + ')-[1-9][0-9]*$');
/** Any CRM Jira key (month projects and SOURCE) / a key in a month project only. */
export const JIRA_KEY = keyPattern(JIRA_PROJECTS);
export const WORK_KEY = keyPattern(MONTH_PROJECTS);
const FALLBACK_PROJECTS = ['OCT', 'SEP', 'SOURCE'];
/** The accepted projects that exist in Jira, in calendar order. If none is visible the original three are kept so a search is never empty. */
export function acceptedProjects(inJira: Iterable<string>): string[] {
  const found = new Set(inJira), keys = (JIRA_PROJECTS as readonly string[]).filter(k => found.has(k));
  return keys.length ? keys : FALLBACK_PROJECTS;
}
/** A JQL clause naming only projects that exist (a missing project makes the whole query fail). */
export const projectClause = (keys: string[]) => 'project in (' + keys.join(', ') + ')';
export type JiraIssue = { id: string; key: string; project_key: string; summary: string; description: unknown; status_id: string; status_name: string; assignee_id: string | null; assignee_name: string | null; jira_updated: string };
export type JiraTransition = { id: string; name: string; to: { id: string; name: string } };
export function descriptionText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const node = value as { text?: unknown; type?: string; content?: unknown[] };
  if (typeof node.text === 'string') return node.text;
  return (node.content || []).map(descriptionText).join(node.type === 'doc' ? '\n' : '');
}
export function plainDescription(text: string) {
  return { type: 'doc', version: 1, content: text.split('\n').map(line => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) };
}
