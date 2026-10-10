export const JIRA_SITE = 'https://vilpowerdigitalmarketing.atlassian.net';
export const JIRA_PROJECTS = ['OCT', 'SEP', 'SOURCE'] as const;
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
