// Prepare a private, allowlisted runtime environment; never print its values.
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
require('@next/env').loadEnvConfig(process.cwd());
const origin='https://vilpower-agency-crm.netlify.app';
const jira=JSON.parse(readFileSync('.jira-oauth-app.local.json','utf8'));
const google=JSON.parse(readFileSync('.sales-google.local.json','utf8'));
if(jira.organizationId!==google.organizationId)throw Error('Provider workspace mismatch');
const values={
 NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 NEXT_PUBLIC_AUTH_GOOGLE_ENABLED:'false',NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED:'false',
 SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY,APP_URL:origin,
 JIRA_ORGANIZATION_ID:jira.organizationId,JIRA_OAUTH_CLIENT_ID:jira.clientId,
 JIRA_OAUTH_CLIENT_SECRET:jira.clientSecret,JIRA_OAUTH_ENCRYPTION_KEY:jira.encryptionKey,
 GOOGLE_SHEETS_ORGANIZATION_ID:google.organizationId,
 GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:google.email,private_key:google.key}),
 GOOGLE_SHEETS_SALES_MEMBERSHIP_IDS:google.members.join(',')
};
for(const [key,value] of Object.entries(values)){
 if(typeof value!=='string'||(!value&&key!=='GOOGLE_SHEETS_SALES_MEMBERSHIP_IDS'))throw Error(`Missing ${key}`);
 if(value.includes("'")||value.includes('\n')||value.includes('\r'))throw Error(`Unsupported environment quoting: ${key}`);
}
mkdirSync('.netlify',{recursive:true});
writeFileSync('.netlify/production.env',Object.entries(values).map(([key,value])=>`${key}='${value}'`).join('\n')+'\n',{mode:0o600});
console.log('Prepared allowlisted environment; values remain in ignored .netlify/production.env');
console.log('Keys: '+Object.keys(values).join(', '));
