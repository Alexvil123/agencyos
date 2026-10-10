import {createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';
import {JIRA_SITE} from './jira-types';
export const JIRA_OAUTH_SCOPES=['read:jira-work','write:jira-work','read:jira-user','offline_access'];
export type OAuthTokens={access_token:string;refresh_token:string;expires_at:number;cloud_id:string};
export function sealTokens(tokens:OAuthTokens,key:string,organizationId:string) {
 const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'base64'),iv);cipher.setAAD(Buffer.from(organizationId));
 return Buffer.concat([iv,cipher.update(JSON.stringify(tokens),'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');
}
export function openTokens(value:string,key:string,organizationId:string):OAuthTokens {
 const packed=Buffer.from(value,'base64');const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),packed.subarray(0,12));decipher.setAAD(Buffer.from(organizationId));decipher.setAuthTag(packed.subarray(-16));
 return JSON.parse(Buffer.concat([decipher.update(packed.subarray(12,-16)),decipher.final()]).toString('utf8'));
}
export function matchingState(state:string|null,cookie:string|undefined) {
 if(!state || !cookie || !/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(cookie))return false;
 return timingSafeEqual(Buffer.from(state),Buffer.from(cookie));
}
export function authorizationUrl(clientId:string,callback:string,state:string) {
 const url=new URL('https://auth.atlassian.com/authorize');url.search=new URLSearchParams({audience:'api.atlassian.com',client_id:clientId,scope:JIRA_OAUTH_SCOPES.join(' '),redirect_uri:callback,state,response_type:'code',prompt:'consent'}).toString();return url;
}
export function selectedResource(resources:{id:string;url:string;scopes:string[]}[]) {
 return resources.find(r=>r.url.replace(/\/$/,'')===JIRA_SITE && /^[0-9a-f-]{36}$/i.test(r.id) && JIRA_OAUTH_SCOPES.filter(s=>s!=='offline_access').every(s=>r.scopes.includes(s)));
}
