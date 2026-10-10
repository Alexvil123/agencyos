import { JIRA_SITE } from './jira-types';
export const JIRA_GATEWAY = 'https://api.atlassian.com/ex/jira/f60b8e24-9101-423d-b785-d792219922aa';
export type JiraCredentials = { email: string; token: string; organizationId: string; tokenType?: 'classic' | 'scoped' | 'oauth'; cloudId?: string };
// No raw Jira response body or credentials are included in errors returned to the UI.
export class JiraError extends Error {
  constructor(public status: number, public uncertain = false) {
    super(status === 429 ? 'Jira rate limit reached. Try again later.' : status === 401 ? 'Jira rejected the account email/API token (401). Use the email of the account that created this token; check token expiry and paste the complete token.' : status === 403 ? 'Jira denied API access (403). Check token scopes, site/project access and organization API-token restrictions.' : uncertain ? 'Jira outcome could not be confirmed. Refresh before retrying.' : 'Jira rejected this operation. Check required fields and workflow permissions.');
  }
}
const cooldowns=new WeakMap<typeof fetch,Map<string,number>>();
export function jiraRetryDelay(value:string|null,now=Date.now()){
  const seconds=value===null?NaN:Number(value);const delay=Number.isFinite(seconds)?seconds*1000:value?Date.parse(value)-now:NaN;
  return Number.isFinite(delay)&&delay>0?Math.min(86400000,delay):60000;
}
export async function jiraRequest<T>(credentials: JiraCredentials, path: string, body?: unknown, method = body ? 'POST' : 'GET', fetcher: typeof fetch = fetch): Promise<T> {
  if (!path.startsWith('/rest/api/3/') || path.includes('..') || path.includes('#')) throw new Error('Invalid Jira route');
  let response: Response;
  if(credentials.tokenType==='oauth' && !/^[0-9a-f-]{36}$/i.test(credentials.cloudId||''))throw new Error('Invalid OAuth tenant');
  const base=credentials.tokenType==='oauth' ? `https://api.atlassian.com/ex/jira/${credentials.cloudId}` : credentials.tokenType==='scoped' ? JIRA_GATEWAY : JIRA_SITE;
  let limits=cooldowns.get(fetcher);if(!limits){limits=new Map();cooldowns.set(fetcher,limits);}const scope=`${credentials.organizationId}:${base}`;
  if((limits.get(scope)||0)>Date.now())throw new JiraError(429);
  const authorization=credentials.tokenType==='oauth' ? `Bearer ${credentials.token}` : `Basic ${Buffer.from(`${credentials.email}:${credentials.token}`).toString('base64')}`;
  try {
    response = await fetcher(`${base}${path}`, { method, headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
  } catch { throw new JiraError(0, method !== 'GET'); }
  if(response.status===429)limits.set(scope,Date.now()+jiraRetryDelay(response.headers.get('Retry-After')));
  if (!response.ok) throw new JiraError(response.status, method !== 'GET' && response.status >= 500);
  if (response.status === 204) return undefined as T;
  try { return await response.json() as T; } catch { throw new JiraError(0, method !== 'GET'); }
}
// Probe only /myself; never retry a mutation or switch hosts during a write.
export async function verifyJiraCredentials(credentials: JiraCredentials, fetcher: typeof fetch = fetch): Promise<JiraCredentials> {
  const classic: JiraCredentials = {...credentials,tokenType:'classic'};
  try { await jiraRequest(classic,'/rest/api/3/myself',undefined,'GET',fetcher); return classic; }
  catch(error) { if (!(error instanceof JiraError) || ![401,403].includes(error.status)) throw error; }
  const scoped: JiraCredentials = {...credentials,tokenType:'scoped'};
  await jiraRequest(scoped,'/rest/api/3/myself',undefined,'GET',fetcher);
  return scoped;
}
