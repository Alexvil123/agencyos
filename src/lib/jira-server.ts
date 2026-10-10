import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { JiraCredentials } from './jira-http';
import {oauthCredentials} from './jira-oauth-server';
export const credentialFile = join(process.cwd(), '.jira-credentials.local.json');
export async function jiraCredentials(organizationId: string): Promise<JiraCredentials | null> {
  const oauth=await oauthCredentials(organizationId);if(oauth)return oauth;
  return legacyJiraCredentials(organizationId);
}
export async function legacyJiraCredentials(organizationId:string):Promise<JiraCredentials|null> {
  if (process.env.JIRA_API_TOKEN && process.env.JIRA_EMAIL && process.env.JIRA_ORGANIZATION_ID === organizationId) return { email: process.env.JIRA_EMAIL.trim(), token: process.env.JIRA_API_TOKEN.trim(), organizationId,tokenType:process.env.JIRA_TOKEN_TYPE === 'scoped' ? 'scoped' : 'classic' };
  if (process.env.NODE_ENV === 'production') return null;
  try {
    const value = JSON.parse(await readFile(credentialFile, 'utf8')) as JiraCredentials;
    return value.organizationId === organizationId && typeof value.email === 'string' && typeof value.token === 'string' ? value : null;
  } catch { return null; }
}
