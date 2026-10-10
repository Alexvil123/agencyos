import 'server-only';
import {oauthDb} from './jira-oauth-server';

/** Read for every request so removal applies across all production instances. */
export async function salesTeamMembers(organizationId:string):Promise<string[]> {
 const {data,error}=await oauthDb().from('sales_team_access').select('members').eq('organization_id',organizationId).maybeSingle();
 if(error)throw new Error('Sales team permissions could not be verified.');
 return data?.members||[];
}
